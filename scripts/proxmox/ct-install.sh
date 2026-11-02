#!/usr/bin/env bash
# VoltDesk — runs inside the LXC container
set -euo pipefail

APP_DIR="/opt/voltdesk"
APP_USER="voltdesk"
APP_PORT="${VOLTDESK_PORT:-3470}"
NODE_MAJOR="${VOLTDESK_NODE_MAJOR:-22}"
REPO_URL="${VOLTDESK_REPO:-https://github.com/nasagreir/voltdesk.git}"
REPO_BRANCH="${VOLTDESK_BRANCH:-main}"
SOURCE_ARCHIVE="${VOLTDESK_SOURCE_ARCHIVE:-/tmp/voltdesk-src.tar.gz}"

export DEBIAN_FRONTEND=noninteractive

msg() { echo -e "\033[1;36m[voltdesk]\033[0m $*"; }
err() { echo -e "\033[1;31m[voltdesk]\033[0m $*" >&2; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    err "ct-install.sh must run as root inside the container"
    exit 1
  fi
}

install_base() {
  msg "Updating apt and installing base packages"
  apt-get update -y
  apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    gnupg \
    jq \
    rsync \
    build-essential \
    python3 \
    tar \
    tini
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local current
    current="$(node -v | sed 's/^v//' | cut -d. -f1 || true)"
    if [[ -n "${current}" && "${current}" -ge "${NODE_MAJOR}" ]]; then
      msg "Node.js $(node -v) already installed"
      return
    fi
  fi

  msg "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  node -v
  npm -v
}

ensure_user() {
  if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    msg "Creating service user ${APP_USER}"
    useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
  fi
  mkdir -p "${APP_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
}

deploy_source() {
  # Existing installs with a repo URL should use the updater (backup + rollback)
  if [[ -f "${APP_DIR}/package.json" \
      && -f "${APP_DIR}/scripts/voltdesk-update.sh" \
      && -n "${REPO_URL}" \
      && ! -f "${SOURCE_ARCHIVE}" ]]; then
    msg "Existing install — delegating to update"
    install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/update
    install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/voltdesk-update
    VOLTDESK_REPO="${REPO_URL}" VOLTDESK_BRANCH="${REPO_BRANCH}" VOLTDESK_PORT="${APP_PORT}" \
      bash "${APP_DIR}/scripts/voltdesk-update.sh" --repo "${REPO_URL}" --branch "${REPO_BRANCH}" --port "${APP_PORT}"
    exit 0
  fi

  msg "Deploying VoltDesk into ${APP_DIR}"
  local stamp previous staging
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  previous="${APP_DIR}.previous"
  staging="${APP_DIR}.staging-${stamp}"
  local had_prior=0

  if [[ -f "${APP_DIR}/package.json" ]]; then
    had_prior=1
    msg "Backing up existing install"
    mkdir -p /var/backups/voltdesk/"${stamp}"
    tar -czf "/var/backups/voltdesk/${stamp}/app.tar.gz" \
      --exclude='./node_modules' --exclude='./.next' --exclude='./.git' \
      -C "${APP_DIR}" . || true
    rm -rf "${previous}"
    mkdir -p "${previous}"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "${APP_DIR}/" "${previous}/"
    else
      tar -C "${APP_DIR}" -cf - . | tar -C "${previous}" -xf -
    fi
  fi

  local env_backup=""
  if [[ -f "${APP_DIR}/.env.local" ]]; then
    env_backup="$(mktemp)"
    cp "${APP_DIR}/.env.local" "${env_backup}"
  fi
  local data_backup=""
  if [[ -d "${APP_DIR}/data" ]]; then
    data_backup="$(mktemp -d)"
    cp -a "${APP_DIR}/data/." "${data_backup}/"
  fi

  rm -rf "${staging}"
  mkdir -p "${staging}"

  if [[ -n "${SOURCE_ARCHIVE}" && -f "${SOURCE_ARCHIVE}" ]]; then
    msg "Extracting source archive ${SOURCE_ARCHIVE}"
    tar -xzf "${SOURCE_ARCHIVE}" -C "${staging}"
  elif [[ -n "${REPO_URL}" ]]; then
    msg "Cloning ${REPO_URL} (${REPO_BRANCH})"
    git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${staging}"
  else
    err "No source provided. Set VOLTDESK_REPO or place ${SOURCE_ARCHIVE}."
    exit 1
  fi

  if [[ ! -f "${staging}/package.json" ]]; then
    err "package.json missing — source deploy failed"
    exit 1
  fi

  if [[ -n "${env_backup}" ]]; then
    mv "${env_backup}" "${staging}/.env.local"
  fi
  if [[ -n "${data_backup}" ]]; then
    mkdir -p "${staging}/data"
    cp -a "${data_backup}/." "${staging}/data/"
    rm -rf "${data_backup}"
  fi

  msg "Installing npm dependencies and building (staged)"
  cd "${staging}"
  if ! {
    if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
    npm run build
  }; then
    if [[ "${had_prior}" -eq 1 && -d "${previous}" ]]; then
      msg "Build failed — rolling back"
      rm -rf "${staging}"
      rm -rf "${APP_DIR}"
      mv "${previous}" "${APP_DIR}"
      systemctl start voltdesk.service 2>/dev/null || true
    fi
    err "Build failed"
    exit 1
  fi

  systemctl stop voltdesk.service 2>/dev/null || true
  rm -rf "${APP_DIR}"
  mv "${staging}" "${APP_DIR}"
}

write_env() {
  local env_file="${APP_DIR}/.env.local"
  if [[ -f "${env_file}" ]]; then
    msg "Keeping existing ${env_file}"
    grep -q '^AUTH_SECRET=' "${env_file}" || echo "AUTH_SECRET=$(openssl rand -hex 32)" >>"${env_file}"
    grep -q '^VOLTDESK_DATA_DIR=' "${env_file}" || echo "VOLTDESK_DATA_DIR=${APP_DIR}/data" >>"${env_file}"
    return
  fi

  msg "Writing ${env_file}"
  cat >"${env_file}" <<EOF
# Generated by VoltDesk Proxmox installer
HOME_ASSISTANT_URL=${HOME_ASSISTANT_URL:-}
HOME_ASSISTANT_TOKEN=${HOME_ASSISTANT_TOKEN:-}
TESLA_ENTITY_PREFIX=${TESLA_ENTITY_PREFIX:-}
TESLA_REFRESH_TOKEN=${TESLA_REFRESH_TOKEN:-}
TESLA_CLIENT_ID=${TESLA_CLIENT_ID:-}
TESLA_REGION=${TESLA_REGION:-na}
POLL_INTERVAL_SECONDS=${POLL_INTERVAL_SECONDS:-60}
AUTH_SECRET=$(openssl rand -hex 32)
VOLTDESK_DATA_DIR=${APP_DIR}/data
EOF
  chmod 640 "${env_file}"
}

write_systemd() {
  msg "Installing systemd unit and CLI helpers"
  install -m 0755 "${APP_DIR}/scripts/voltdesk-user" /usr/local/bin/voltdesk-user
  install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/update
  install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/voltdesk-update
  chmod +x "${APP_DIR}/scripts/voltdesk-user.mjs" "${APP_DIR}/scripts/voltdesk-update.sh" || true

  mkdir -p "${APP_DIR}/data"
  chmod 750 "${APP_DIR}/data"

  cat >/etc/systemd/system/voltdesk.service <<EOF
[Unit]
Description=VoltDesk Tesla vehicle dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=VOLTDESK_DATA_DIR=${APP_DIR}/data
EnvironmentFile=-${APP_DIR}/.env.local
ExecStart=/usr/bin/npm run start -- --port ${APP_PORT} --hostname 0.0.0.0
Restart=on-failure
RestartSec=5
TimeoutStartSec=120

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF

  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
  systemctl daemon-reload
  systemctl enable --now voltdesk.service
  sleep 2
  systemctl --no-pager --full status voltdesk.service || true
}

print_summary() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  msg "VoltDesk is installed"
  echo "  App dir : ${APP_DIR}"
  echo "  Service : systemctl status voltdesk"
  echo "  URL     : http://${ip:-<container-ip>}:${APP_PORT}"
  echo "  Setup   : open the URL and create your username / password"
  echo "  Update  : update   (backup + auto-rollback)"
  echo "  Config  : ${APP_DIR}/.env.local"
}

main() {
  require_root
  install_base
  install_node
  ensure_user
  deploy_source
  write_env
  write_systemd
  print_summary
}

main "$@"
