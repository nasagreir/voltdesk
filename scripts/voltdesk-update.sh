#!/usr/bin/env bash
# =============================================================================
# VoltDesk updater — backup first, deploy, health-check, auto-rollback on fail
# =============================================================================
# Usage (inside the LXC as root):
#   update
#   update --branch main
#   VOLTDESK_REPO=https://github.com/nasagreir/voltdesk.git update
#   voltdesk-update   # same command, kept as an alias
#
# Default source: https://github.com/nasagreir/voltdesk
# =============================================================================
set -euo pipefail

VOLTDESK_GITHUB_URL="https://github.com/nasagreir/voltdesk.git"

APP_DIR="${VOLTDESK_APP_DIR:-/opt/voltdesk}"
APP_USER="${VOLTDESK_APP_USER:-voltdesk}"
APP_PORT="${VOLTDESK_PORT:-3470}"
BACKUP_ROOT="${VOLTDESK_BACKUP_ROOT:-/var/backups/voltdesk}"
KEEP_BACKUPS="${VOLTDESK_KEEP_BACKUPS:-5}"
REPO_URL="${VOLTDESK_REPO:-}"
REPO_BRANCH="${VOLTDESK_BRANCH:-main}"
HEALTH_URL="${VOLTDESK_HEALTH_URL:-http://127.0.0.1:${APP_PORT}/api/auth/me}"
HEALTH_RETRIES="${VOLTDESK_HEALTH_RETRIES:-20}"
HEALTH_SLEEP="${VOLTDESK_HEALTH_SLEEP:-3}"

BL=$'\033[36m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; YW=$'\033[33m'; CL=$'\033[m'
msg(){ echo -e "${BL}[update]${CL} $*"; }
ok(){ echo -e "${GN}[update]${CL} $*"; }
warn(){ echo -e "${YW}[update]${CL} $*"; }
err(){ echo -e "${RD}[update]${CL} $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) REPO_BRANCH="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --port) APP_PORT="$2"; HEALTH_URL="http://127.0.0.1:${APP_PORT}/api/auth/me"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) err "Unknown argument: $1" ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || err "Run as root inside the VoltDesk LXC."
[[ -d "${APP_DIR}" ]] || err "App directory missing: ${APP_DIR}"
[[ -f "${APP_DIR}/package.json" ]] || err "Not an VoltDesk install: ${APP_DIR}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"
STAGING="${APP_DIR}.update-${STAMP}"
PREVIOUS="${APP_DIR}.previous"
ROLLED_BACK=0

cleanup_staging() {
  rm -rf "${STAGING}" 2>/dev/null || true
}

healthcheck() {
  local i
  for ((i=1; i<=HEALTH_RETRIES; i++)); do
    if curl -fsS --max-time 5 "${HEALTH_URL}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${HEALTH_SLEEP}"
  done
  return 1
}

rollback() {
  local reason="${1:-update failed}"
  warn "Rolling back — ${reason}"
  systemctl stop voltdesk.service 2>/dev/null || true
  cleanup_staging

  if [[ -d "${PREVIOUS}" && -f "${PREVIOUS}/package.json" ]]; then
    rm -rf "${APP_DIR}"
    mv "${PREVIOUS}" "${APP_DIR}"
    chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
    systemctl daemon-reload
    systemctl start voltdesk.service || true
    sleep 2
    if healthcheck; then
      ok "Rollback succeeded — previous version is running again"
    else
      warn "Files restored but health check still failing — check: journalctl -u voltdesk -e"
    fi
    ROLLED_BACK=1
    return 0
  fi

  if [[ -f "${BACKUP_DIR}/app.tar.gz" ]]; then
    warn "Restoring from archive ${BACKUP_DIR}/app.tar.gz (may need rebuild)"
    rm -rf "${APP_DIR}"
    mkdir -p "${APP_DIR}"
    tar -xzf "${BACKUP_DIR}/app.tar.gz" -C "${APP_DIR}"
    cd "${APP_DIR}"
    if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
    npm run build
    chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
    systemctl daemon-reload
    systemctl start voltdesk.service || true
    ROLLED_BACK=1
    ok "Restored from backup archive"
    return 0
  fi

  err "No backup available to roll back to"
}

prune_backups() {
  [[ -d "${BACKUP_ROOT}" ]] || return 0
  mapfile -t dirs < <(find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d | sort -r)
  local idx=0
  for d in "${dirs[@]}"; do
    idx=$((idx + 1))
    if (( idx > KEEP_BACKUPS )); then
      msg "Pruning old backup ${d}"
      rm -rf "${d}"
    fi
  done
}

resolve_repo() {
  if [[ -n "${REPO_URL}" ]]; then
    return
  fi
  if [[ -d "${APP_DIR}/.git" ]]; then
    REPO_URL="$(git -C "${APP_DIR}" remote get-url origin 2>/dev/null || true)"
  fi
  REPO_URL="${REPO_URL:-${VOLTDESK_GITHUB_URL}}"
}

create_backup() {
  msg "Creating backup at ${BACKUP_DIR}"
  mkdir -p "${BACKUP_DIR}" "${BACKUP_ROOT}"

  # Portable archive (source + env + data; rebuildable dirs omitted)
  tar -czf "${BACKUP_DIR}/app.tar.gz" \
    --exclude='./node_modules' \
    --exclude='./.next' \
    --exclude='./.git' \
    -C "${APP_DIR}" .

  # Fast rollback copy = exact running tree including node_modules + .next
  msg "Snapshotting live install for fast rollback"
  rm -rf "${PREVIOUS}"
  mkdir -p "${PREVIOUS}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${APP_DIR}/" "${PREVIOUS}/"
  else
    tar -C "${APP_DIR}" -cf - . | tar -C "${PREVIOUS}" -xf -
  fi

  printf '%s\n' "${STAMP}" >"${BACKUP_DIR}/stamp.txt"
  ok "Backup ready"
}

deploy_staging() {
  resolve_repo
  msg "Fetching ${REPO_URL} @ ${REPO_BRANCH} into staging"
  rm -rf "${STAGING}"
  mkdir -p "${STAGING}"
  git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${STAGING}"

  if [[ -f "${APP_DIR}/.env.local" ]]; then
    cp -a "${APP_DIR}/.env.local" "${STAGING}/.env.local"
  fi
  if [[ -d "${APP_DIR}/data" ]]; then
    mkdir -p "${STAGING}/data"
    cp -a "${APP_DIR}/data/." "${STAGING}/data/"
  fi

  msg "Building staged release"
  cd "${STAGING}"
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
  npm run build
  [[ -d "${STAGING}/.next" ]] || err "Build produced no .next output"
}

swap_release() {
  msg "Stopping voltdesk service"
  systemctl stop voltdesk.service || true

  local live_tmp="${APP_DIR}.replacing-${STAMP}"
  mv "${APP_DIR}" "${live_tmp}"
  mv "${STAGING}" "${APP_DIR}"
  rm -rf "${live_tmp}"

  if [[ -f "${APP_DIR}/scripts/voltdesk-user" ]]; then
    install -m 0755 "${APP_DIR}/scripts/voltdesk-user" /usr/local/bin/voltdesk-user
  fi
  if [[ -f "${APP_DIR}/scripts/voltdesk-update" ]]; then
    install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/update
    install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/voltdesk-update
  fi
  chmod +x "${APP_DIR}/scripts/voltdesk-update.sh" || true

  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
  systemctl daemon-reload
  msg "Starting voltdesk service"
  systemctl start voltdesk.service
}

main() {
  msg "Updating VoltDesk in ${APP_DIR}"
  create_backup

  if ! deploy_staging; then
    cleanup_staging
    err "Staging deploy/build failed — live app untouched (backup at ${BACKUP_DIR})"
  fi

  if ! swap_release; then
    rollback "failed to swap release"
    err "Update failed and was rolled back"
  fi

  msg "Waiting for health check (${HEALTH_URL})"
  if ! healthcheck; then
    rollback "new release failed health check"
    err "Update failed health check and was rolled back"
  fi

  prune_backups
  ok "Update complete — VoltDesk is healthy on :${APP_PORT}"
  ok "Backup: ${BACKUP_DIR}  |  Fast rollback copy: ${PREVIOUS}"
  ok "Next time, run: update"
}

trap 'status=$?; if [[ $status -ne 0 && ${ROLLED_BACK} -eq 0 ]]; then warn "Update aborted"; cleanup_staging; fi' EXIT
main "$@"
