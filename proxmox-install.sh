#!/usr/bin/env bash
# =============================================================================
# VoltDesk — single pasteable Proxmox LXC installer
# Same app as the Docker image (Dockerfile, compose.yaml). Keep both installs in step.
# =============================================================================
# Repo: https://github.com/nasagreir/voltdesk
#
# Paste this entire file into a Proxmox VE host shell (as root), OR run:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/voltdesk/main/proxmox-install.sh)"
#
# Fully automatic (no prompts):
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/voltdesk/main/proxmox-install.sh)" -- --yes
#
# =============================================================================
set -euo pipefail

# Canonical public GitHub repo (override with VOLTDESK_REPO=... if needed)
VOLTDESK_GITHUB_URL="https://github.com/nasagreir/voltdesk.git"
VOLTDESK_GITHUB_RAW="https://raw.githubusercontent.com/nasagreir/voltdesk"

# --------------- edit these if you want non-interactive defaults -------------
VOLTDESK_REPO="${VOLTDESK_REPO:-${VOLTDESK_GITHUB_URL}}"
VOLTDESK_BRANCH="${VOLTDESK_BRANCH:-main}"
VOLTDESK_PORT="${VOLTDESK_PORT:-3470}"
VOLTDESK_CTID="${VOLTDESK_CTID:-}"
VOLTDESK_HOSTNAME="${VOLTDESK_HOSTNAME:-voltdesk}"
VOLTDESK_CORES="${VOLTDESK_CORES:-2}"
VOLTDESK_MEMORY="${VOLTDESK_MEMORY:-2048}"
VOLTDESK_DISK="${VOLTDESK_DISK:-8}"
VOLTDESK_BRIDGE="${VOLTDESK_BRIDGE:-vmbr0}"
# Root filesystem storage (rootdir) — e.g. local-lvm / local-zfs
VOLTDESK_STORAGE="${VOLTDESK_STORAGE:-}"
# Template storage (vztmpl) — e.g. local  (MUST support templates; not LVM-thin)
VOLTDESK_TEMPLATE_STORAGE="${VOLTDESK_TEMPLATE_STORAGE:-}"
VOLTDESK_UNPRIVILEGED="${VOLTDESK_UNPRIVILEGED:-1}"
VOLTDESK_YES="${VOLTDESK_YES:-0}"
HOME_ASSISTANT_URL="${HOME_ASSISTANT_URL:-}"
HOME_ASSISTANT_TOKEN="${HOME_ASSISTANT_TOKEN:-}"
TESLA_ENTITY_PREFIX="${TESLA_ENTITY_PREFIX:-}"
TESLA_REFRESH_TOKEN="${TESLA_REFRESH_TOKEN:-}"
TESLA_CLIENT_ID="${TESLA_CLIENT_ID:-}"
TESLA_REGION="${TESLA_REGION:-na}"
# -----------------------------------------------------------------------------

APP="VoltDesk"
YW=$'\033[33m'; BL=$'\033[36m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; CL=$'\033[m'; BOLD=$'\033[1m'
# Always log to stderr so command substitutions (e.g. pick_template) stay clean
msg_info() { echo -e "${BL}${BOLD}[INFO]${CL} $1" >&2; }
msg_ok()   { echo -e "${GN}${BOLD}[OK]${CL} $1" >&2; }
msg_warn() { echo -e "${YW}${BOLD}[WARN]${CL} $1" >&2; }
msg_error(){ echo -e "${RD}${BOLD}[ERROR]${CL} $1" >&2; exit 1; }

# Parse flags early (supports: script.sh --yes   OR   bash -c "$(curl ...)" -- --yes)
AUTO_YES=0
for arg in "$@"; do
  case "${arg}" in
    -y|--yes|--auto) AUTO_YES=1 ;;
    -h|--help)
      cat <<EOF
VoltDesk Proxmox LXC installer

Usage:
  bash proxmox-install.sh [--yes]
  bash -c "\$(curl -fsSL ${VOLTDESK_GITHUB_RAW}/main/proxmox-install.sh)" -- --yes

Options:
  -y, --yes, --auto   No prompts — use sensible defaults and install
  -h, --help          Show this help

Env overrides: VOLTDESK_REPO, VOLTDESK_BRANCH, VOLTDESK_PORT, VOLTDESK_CTID,
  VOLTDESK_HOSTNAME, VOLTDESK_CORES, VOLTDESK_MEMORY, VOLTDESK_DISK,
  VOLTDESK_BRIDGE, VOLTDESK_STORAGE (rootfs), VOLTDESK_TEMPLATE_STORAGE,
  HOME_ASSISTANT_URL, HOME_ASSISTANT_TOKEN, TESLA_ENTITY_PREFIX,
  TESLA_REFRESH_TOKEN, TESLA_CLIENT_ID, TESLA_REGION
EOF
      exit 0
      ;;
  esac
done
[[ "${VOLTDESK_YES}" == "1" || "${VOLTDESK_YES}" == "true" ]] && AUTO_YES=1
# Non-interactive stdin (piped curl|bash without a TTY) → auto
if [[ ! -t 0 && "${AUTO_YES}" -eq 0 ]]; then
  AUTO_YES=1
fi

header() {
  clear 2>/dev/null || true
  cat <<EOF
${BOLD}${BL}
 __      __   _ _   ____            _
 \\ \\    / /  | | | |  _ \\          | |
  \\ \\  / /__ | | |_| | | | ___  ___| | __
   \\ \\/ / _ \\| | __| | | |/ _ \\/ __| |/ /
    \\  / (_) | | |_| |_| |  __/\\__ \\   <
     \\/ \\___/|_|\\__|____/ \\___||___/_|\\_\\
${CL}
  Tesla vehicle dashboard — Proxmox LXC installer
  Repo: https://github.com/nasagreir/voltdesk
  Same update flow as OrbitDesk: backup, swap, health check, rollback
EOF
}

need_proxmox() {
  [[ "${EUID}" -eq 0 ]] || msg_error "Run as root on the Proxmox host."
  command -v pveversion >/dev/null || msg_error "Not a Proxmox host (pveversion missing)."
  command -v pct >/dev/null || msg_error "pct missing."
  command -v pvesm >/dev/null || msg_error "pvesm missing."
  command -v pveam >/dev/null || msg_error "pveam missing."
}

prompt() {
  local var="$1" label="$2" default="$3" value
  if [[ "${AUTO_YES}" -eq 1 ]]; then
    printf -v "${var}" '%s' "${default}"
    return
  fi
  read -r -p "${label} [${default}]: " value || true
  printf -v "${var}" '%s' "${value:-$default}"
}

confirm_yn() {
  local p="$1" d="${2:-y}" a
  if [[ "${AUTO_YES}" -eq 1 ]]; then
    return 0
  fi
  read -r -p "${p} [${d}]: " a || true
  [[ "${a:-$d}" =~ ^[Yy]$ ]]
}

# True if VM/CT id is used anywhere in the cluster (not just this node).
# Ground truth is /etc/pve/nodes/<node>/{qemu-server,lxc}/<id>.conf — qm/pct
# status on this node cannot see a guest that lives on another node.
id_in_use() {
  local id="$1" conf node

  [[ "${id}" =~ ^[0-9]+$ ]] || return 1

  shopt -s nullglob
  local -a confs=(
    /etc/pve/nodes/*/qemu-server/"${id}".conf
    /etc/pve/nodes/*/lxc/"${id}".conf
  )
  shopt -u nullglob
  if (( ${#confs[@]} > 0 )); then
    return 0
  fi

  if [[ -f /etc/pve/.vmlist ]] && grep -Eq "\"${id}\"[[:space:]]*:" /etc/pve/.vmlist 2>/dev/null; then
    return 0
  fi

  pct config "${id}" &>/dev/null && return 0
  qm config "${id}" &>/dev/null && return 0

  if command -v pvesh >/dev/null 2>&1; then
    if pvesh get /cluster/resources --type vm --output-format json 2>/dev/null \
      | grep -Eq "\"(vmid|id)\"[[:space:]]*:[[:space:]]*\"?(qemu|lxc)/?${id}\"?([,}]|$)" \
      || pvesh get /cluster/resources --type vm --output-format json 2>/dev/null \
        | grep -Eq "\"vmid\"[[:space:]]*:[[:space:]]*${id}([,}]|$)"; then
      return 0
    fi
  fi

  return 1
}

id_location_hint() {
  local id="$1" conf node="" kind=""
  shopt -s nullglob
  for conf in /etc/pve/nodes/*/qemu-server/"${id}".conf /etc/pve/nodes/*/lxc/"${id}".conf; do
    node="$(basename "$(dirname "$(dirname "${conf}")")")"
    [[ "${conf}" == *qemu-server* ]] && kind="VM" || kind="CT"
    echo "${kind} on ${node}"
    shopt -u nullglob
    return
  done
  shopt -u nullglob
  echo ""
}

# Smallest free ID strictly greater than $1 (or >= 100 when called as next_ctid).
next_free_after() {
  local id="$1"
  while id_in_use "${id}"; do
    id=$((id + 1))
    if (( id > 999999 )); then
      msg_error "Could not find a free CT/VM ID."
    fi
  done
  printf '%s\n' "${id}"
}

next_ctid() {
  local nid=""

  # Official cluster-wide free ID. Output is sometimes "101", sometimes a JSON scalar.
  if command -v pvesh >/dev/null 2>&1; then
    nid="$(pvesh get /cluster/nextid --output-format json 2>/dev/null | tr -cd '0-9' || true)"
    if [[ -z "${nid}" ]]; then
      nid="$(pvesh get /cluster/nextid 2>/dev/null | tr -cd '0-9' || true)"
    fi
    if [[ "${nid}" =~ ^[0-9]+$ ]] && ! id_in_use "${nid}"; then
      printf '%s\n' "${nid}"
      return
    fi
  fi

  next_free_after 100
}

ensure_free_ctid() {
  local requested="$1" hint free
  if ! id_in_use "${requested}"; then
    echo "${requested}"
    return
  fi

  hint="$(id_location_hint "${requested}")"
  free="$(next_ctid)"

  if [[ -n "${VOLTDESK_CTID}" && "${AUTO_YES}" -eq 1 ]]; then
    msg_error "CT/VM ID ${requested} is already in use${hint:+ (${hint})}. Unset VOLTDESK_CTID or pick a free ID (next free: ${free})."
  fi

  if [[ "${AUTO_YES}" -eq 1 ]]; then
    msg_warn "ID ${requested} already in use${hint:+ (${hint})} — using free ID ${free}"
    echo "${free}"
    return
  fi

  msg_warn "ID ${requested} already in use${hint:+ (${hint})}"
  prompt requested "LXC CT ID (cluster-wide unique)" "${free}"
  if id_in_use "${requested}"; then
    msg_error "CT/VM ID ${requested} is still in use. Try ${free}."
  fi
  echo "${requested}"
}

# Prefer "local" for templates; never pick LVM-thin for vztmpl.
storage_supports() {
  local name="$1" kind="$2"
  pvesm status -content "${kind}" 2>/dev/null | awk -v n="${name}" 'NR>1 && $1==n {found=1} END{exit !found}'
}

list_storage() {
  local kind="$1"
  pvesm status -content "${kind}" 2>/dev/null | awk 'NR>1 {print $1}'
}

pick_rootfs_storage() {
  if [[ -n "${VOLTDESK_STORAGE}" ]]; then
    storage_supports "${VOLTDESK_STORAGE}" rootdir \
      || msg_error "Storage '${VOLTDESK_STORAGE}' does not support container rootfs (rootdir)."
    echo "${VOLTDESK_STORAGE}"
    return
  fi

  # Prefer local-lvm / local-zfs (typical Proxmox install), then anything with rootdir
  local s
  for s in local-lvm local-zfs; do
    if storage_supports "${s}" rootdir; then
      echo "${s}"
      return
    fi
  done
  s="$(list_storage rootdir | head -n1)"
  [[ -n "${s}" ]] || msg_error "No storage with rootdir content (needed for LXC disks)."
  echo "${s}"
}

pick_template_storage() {
  if [[ -n "${VOLTDESK_TEMPLATE_STORAGE}" ]]; then
    storage_supports "${VOLTDESK_TEMPLATE_STORAGE}" vztmpl \
      || msg_error "Storage '${VOLTDESK_TEMPLATE_STORAGE}' does not support templates (vztmpl). Use 'local' or another directory store."
    echo "${VOLTDESK_TEMPLATE_STORAGE}"
    return
  fi

  # Prefer local — never use the same LVM-thin volume as rootfs for templates
  local s
  if storage_supports local vztmpl; then
    echo local
    return
  fi
  while read -r s; do
    [[ -z "${s}" ]] && continue
    # Skip typical block/thin pools that cannot hold file templates
    case "${s}" in
      *-lvm|*-thin|*lvm*) continue ;;
    esac
    echo "${s}"
    return
  done < <(list_storage vztmpl)

  s="$(list_storage vztmpl | head -n1)"
  [[ -n "${s}" ]] || msg_error "No storage with vztmpl content. Enable templates on 'local' (Datacenter → Storage → local → Content → Container Templates)."
  echo "${s}"
}

default_bridge() {
  if [[ -n "${VOLTDESK_BRIDGE}" ]] && ip link show "${VOLTDESK_BRIDGE}" &>/dev/null; then
    echo "${VOLTDESK_BRIDGE}"
    return
  fi
  local b
  for b in vmbr0 vmbr1; do
    if ip link show "${b}" &>/dev/null; then
      echo "${b}"
      return
    fi
  done
  echo "${VOLTDESK_BRIDGE:-vmbr0}"
}

pick_template() {
  local tmpl_storage="$1" template volid
  # stdout must be ONLY the volume id — all logs go to stderr
  template="$(pveam list "${tmpl_storage}" 2>/dev/null | awk '/debian-12-standard/ {print $1; exit}')"
  if [[ -z "${template}" ]]; then
    msg_info "Downloading Debian 12 template → storage '${tmpl_storage}' (not rootfs storage)"
    pveam update >/dev/null || true
    volid="$(pveam available -section system 2>/dev/null | awk '/debian-12-standard/ {print $2; exit}')"
    if [[ -z "${volid}" ]]; then
      # Fallback: any debian-12 listing
      volid="$(pveam available 2>/dev/null | awk '/debian-12-standard/ {print $2; exit}')"
    fi
    [[ -n "${volid}" ]] || msg_error "debian-12-standard template not found in pveam available."
    # pveam download progress belongs on the terminal, not in $template
    if ! pveam download "${tmpl_storage}" "${volid}" >&2; then
      msg_error "Failed to download template to '${tmpl_storage}'. That storage must support 'vztmpl' (use local, not local-lvm)."
    fi
    template="$(pveam list "${tmpl_storage}" 2>/dev/null | awk '/debian-12-standard/ {print $1; exit}')"
  fi
  [[ -n "${template}" ]] || msg_error "Template missing on ${tmpl_storage}."
  # Normalize: some hosts return a bare filename; pct wants storage:vztmpl/...
  if [[ "${template}" != *:* ]]; then
    template="${tmpl_storage}:vztmpl/${template}"
  fi
  printf '%s\n' "${template}"
}

# Detect local checkout when this file lives inside the VoltDesk repo
resolve_local() {
  LOCAL_MODE=0
  REPO_ROOT=""
  local source="${BASH_SOURCE[0]:-}"
  if [[ -n "${source}" && -f "${source}" ]]; then
    local dir root
    dir="$(cd "$(dirname "${source}")" && pwd)"
    root="${dir}"
    if [[ -f "${root}/package.json" ]] && grep -q '"name": "voltdesk"' "${root}/package.json" 2>/dev/null; then
      LOCAL_MODE=1
      REPO_ROOT="${root}"
    fi
  fi
}

gather() {
  header
  echo
  msg_info "VoltDesk installer (cluster-safe IDs). Creates a Debian 12 LXC on port ${VOLTDESK_PORT}."
  if [[ "${AUTO_YES}" -eq 1 ]]; then
    msg_ok "Automatic mode — using detected defaults (pass flags interactively by running without --yes)."
  fi
  echo

  CTID="${VOLTDESK_CTID:-$(next_ctid)}"
  if [[ "${AUTO_YES}" -eq 0 ]]; then
    prompt CTID "LXC CT ID (cluster-wide unique)" "${CTID}"
  fi
  CTID="$(ensure_free_ctid "${CTID}")"

  HN="${VOLTDESK_HOSTNAME}"
  CORES="${VOLTDESK_CORES}"
  MEMORY="${VOLTDESK_MEMORY}"
  DISK="${VOLTDESK_DISK}"
  BRIDGE="$(default_bridge)"
  STORAGE="$(pick_rootfs_storage)"
  TEMPLATE_STORAGE="$(pick_template_storage)"

  if [[ "${AUTO_YES}" -eq 0 ]]; then
    prompt HN "Hostname" "${HN}"
    prompt CORES "CPU cores" "${CORES}"
    prompt MEMORY "Memory (MiB)" "${MEMORY}"
    prompt DISK "Disk size (GiB)" "${DISK}"
    prompt BRIDGE "Bridge" "${BRIDGE}"
    prompt STORAGE "Rootfs storage (rootdir)" "${STORAGE}"
    prompt TEMPLATE_STORAGE "Template storage (vztmpl)" "${TEMPLATE_STORAGE}"
  fi

  storage_supports "${STORAGE}" rootdir \
    || msg_error "Storage '${STORAGE}' does not support rootdir."
  storage_supports "${TEMPLATE_STORAGE}" vztmpl \
    || msg_error "Storage '${TEMPLATE_STORAGE}' does not support vztmpl (templates). Use 'local', not 'local-lvm'."

  if [[ "${LOCAL_MODE}" -eq 1 ]]; then
    msg_ok "Local repo detected at ${REPO_ROOT} — will copy into the CT."
    SOURCE_MODE="local"
  else
    SOURCE_MODE="git"
    VOLTDESK_REPO="${VOLTDESK_REPO:-${VOLTDESK_GITHUB_URL}}"
    if [[ "${AUTO_YES}" -eq 0 ]]; then
      echo
      msg_info "Source: ${VOLTDESK_REPO} (branch ${VOLTDESK_BRANCH})"
      prompt VOLTDESK_REPO "VoltDesk git URL" "${VOLTDESK_REPO}"
      prompt VOLTDESK_BRANCH "Git branch" "${VOLTDESK_BRANCH}"
    fi
    [[ -n "${VOLTDESK_REPO}" ]] || msg_error "VOLTDESK_REPO is required when not run from a local clone."
  fi

  if [[ "${AUTO_YES}" -eq 0 ]]; then
    echo
    msg_info "Optional integrations (Enter skips — demo mode still works)"
    prompt HOME_ASSISTANT_URL "Home Assistant URL" "${HOME_ASSISTANT_URL}"
    prompt HOME_ASSISTANT_TOKEN "Home Assistant token" "${HOME_ASSISTANT_TOKEN}"
    prompt TESLA_ENTITY_PREFIX "HA entity prefix (sensor.<prefix>_battery)" "${TESLA_ENTITY_PREFIX}"
    prompt TESLA_CLIENT_ID "Tesla Fleet client id" "${TESLA_CLIENT_ID}"
    prompt TESLA_REFRESH_TOKEN "Tesla refresh token" "${TESLA_REFRESH_TOKEN}"
    prompt TESLA_REGION "Tesla region na|eu|cn" "${TESLA_REGION}"
  fi

  echo
  echo "  Plan"
  echo "  ----"
  echo "  CT ID            : ${CTID}"
  echo "  Hostname         : ${HN}"
  echo "  Resources        : ${CORES}c / ${MEMORY}M RAM / ${DISK}G disk"
  echo "  Bridge           : ${BRIDGE}"
  echo "  Rootfs storage   : ${STORAGE}"
  echo "  Template storage : ${TEMPLATE_STORAGE}"
  echo "  Source           : ${SOURCE_MODE} (${VOLTDESK_REPO:-local} @ ${VOLTDESK_BRANCH})"
  echo "  App port         : ${VOLTDESK_PORT}"
  echo
  confirm_yn "Install ${APP} now?" "y" || msg_error "Aborted."
}

create_ct() {
  local template password="" attempt id create_log
  template="$(pick_template "${TEMPLATE_STORAGE}")"
  password=""
  if [[ ! -f /root/.ssh/authorized_keys ]]; then
    password="$(openssl rand -base64 18)"
  fi

  id="${CTID}"
  for attempt in $(seq 1 40); do
    if id_in_use "${id}"; then
      msg_warn "ID ${id} already used ($(id_location_hint "${id}")) — skipping"
      id="$(next_free_after $((id + 1)))"
      continue
    fi

    msg_info "Creating CT ${id} (template ${template} → rootfs ${STORAGE}:${DISK})"

    local -a args=(
      create "${id}" "${template}"
      --hostname "${HN}"
      --cores "${CORES}"
      --memory "${MEMORY}"
      --swap 512
      --rootfs "${STORAGE}:${DISK}"
      --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp"
      --unprivileged "${VOLTDESK_UNPRIVILEGED}"
      --features nesting=1
      --onboot 1
      --ostype debian
      --start 0
    )
    if [[ -f /root/.ssh/authorized_keys ]]; then
      args+=(--ssh-public-keys /root/.ssh/authorized_keys)
    else
      args+=(--password "${password}")
    fi

    create_log="$(mktemp)"
    if pct "${args[@]}" >"${create_log}" 2>&1; then
      rm -f "${create_log}"
      CTID="${id}"
      msg_ok "CT ${CTID} created"
      [[ -z "${password}" ]] || msg_warn "CT root password: ${password}"
      return 0
    fi

    cat "${create_log}" >&2 || true
    if grep -qiE 'already exists|unique|already used' "${create_log}" 2>/dev/null; then
      rm -f "${create_log}"
      msg_warn "Cluster rejected ID ${id} (already exists on another node) — trying the next free ID"
      id="$(next_free_after $((id + 1)))"
      continue
    fi
    rm -f "${create_log}"
    msg_error "pct create failed. Template storage must support vztmpl; rootfs storage must support rootdir."
  done

  msg_error "Could not find a free CT ID after ${attempt} attempts."
}

start_ct() {
  msg_info "Starting CT ${CTID}"
  pct start "${CTID}"
  local i
  for i in $(seq 1 90); do
    if pct exec "${CTID}" -- bash -c 'hostname -I | grep -qE "[0-9]+\.[0-9]+"' 2>/dev/null; then
      msg_ok "Network is up"
      return
    fi
    sleep 2
  done
  msg_warn "No DHCP address yet — continuing (app may come up once networking works)"
}

# In-container installer (embedded — this file is the only thing you need)
write_ct_installer() {
  cat <<'CT_INSTALL_EOF'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/voltdesk
APP_USER=voltdesk
APP_PORT="${VOLTDESK_PORT:-3470}"
NODE_MAJOR="${VOLTDESK_NODE_MAJOR:-22}"
REPO_URL="${VOLTDESK_REPO:-https://github.com/nasagreir/voltdesk.git}"
REPO_BRANCH="${VOLTDESK_BRANCH:-main}"
SOURCE_ARCHIVE="${VOLTDESK_SOURCE_ARCHIVE:-}"
export DEBIAN_FRONTEND=noninteractive
msg(){ echo -e "\033[1;36m[voltdesk]\033[0m $*"; }
err(){ echo -e "\033[1;31m[voltdesk]\033[0m $*" >&2; exit 1; }
[[ "${EUID}" -eq 0 ]] || err "must be root in CT"

msg "Installing base packages"
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl git gnupg jq build-essential python3 tar tini rsync

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//;s/\..*//')" -lt "${NODE_MAJOR}" ]]; then
  msg "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v; npm -v

id -u "${APP_USER}" &>/dev/null || useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
mkdir -p "${APP_DIR}"

# Prefer the dedicated updater when VoltDesk is already installed
if [[ -f "${APP_DIR}/package.json" && -x "${APP_DIR}/scripts/voltdesk-update.sh" && -z "${SOURCE_ARCHIVE}" && -n "${REPO_URL}" ]]; then
  msg "Existing install detected — using update (backup + rollback)"
  install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/update 2>/dev/null || true
  install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/voltdesk-update 2>/dev/null || true
  VOLTDESK_REPO="${REPO_URL}" VOLTDESK_BRANCH="${REPO_BRANCH}" VOLTDESK_PORT="${APP_PORT}" \
    bash "${APP_DIR}/scripts/voltdesk-update.sh" --repo "${REPO_URL}" --branch "${REPO_BRANCH}" --port "${APP_PORT}"
  exit 0
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_ROOT=/var/backups/voltdesk
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"
PREVIOUS="${APP_DIR}.previous"
STAGING="${APP_DIR}.staging-${STAMP}"
HAD_PRIOR=0

if [[ -f "${APP_DIR}/package.json" ]]; then
  HAD_PRIOR=1
  msg "Backing up existing install before redeploy"
  mkdir -p "${BACKUP_DIR}"
  tar -czf "${BACKUP_DIR}/app.tar.gz" \
    --exclude='./node_modules' --exclude='./.next' --exclude='./.git' \
    -C "${APP_DIR}" . || true
  rm -rf "${PREVIOUS}"
  mkdir -p "${PREVIOUS}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${APP_DIR}/" "${PREVIOUS}/"
  else
    tar -C "${APP_DIR}" -cf - . | tar -C "${PREVIOUS}" -xf -
  fi
fi

env_backup=""
data_backup=""
[[ -f "${APP_DIR}/.env.local" ]] && { env_backup=$(mktemp); cp "${APP_DIR}/.env.local" "${env_backup}"; }
[[ -d "${APP_DIR}/data" ]] && { data_backup=$(mktemp -d); cp -a "${APP_DIR}/data/." "${data_backup}/"; }

rollback_prior() {
  msg "Deploy/build failed — rolling back to previous install"
  systemctl stop voltdesk.service 2>/dev/null || true
  rm -rf "${STAGING}" "${APP_DIR}"
  if [[ -d "${PREVIOUS}" ]]; then
    mv "${PREVIOUS}" "${APP_DIR}"
    chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
    systemctl start voltdesk.service 2>/dev/null || true
    msg "Rollback complete"
  fi
  exit 1
}

rm -rf "${STAGING}"
mkdir -p "${STAGING}"
if [[ -n "${SOURCE_ARCHIVE}" && -f "${SOURCE_ARCHIVE}" ]]; then
  msg "Extracting ${SOURCE_ARCHIVE}"
  tar -xzf "${SOURCE_ARCHIVE}" -C "${STAGING}"
elif [[ -n "${REPO_URL}" ]]; then
  msg "Cloning ${REPO_URL} (${REPO_BRANCH})"
  git clone --depth 1 --branch "${REPO_BRANCH}" "${REPO_URL}" "${STAGING}"
else
  err "No VOLTDESK_REPO or source archive"
fi
[[ -f "${STAGING}/package.json" ]] || err "package.json missing after deploy"
[[ -n "${env_backup}" ]] && mv "${env_backup}" "${STAGING}/.env.local"
if [[ -n "${data_backup}" ]]; then
  mkdir -p "${STAGING}/data"
  cp -a "${data_backup}/." "${STAGING}/data/"
  rm -rf "${data_backup}"
fi

AUTH_SECRET_VALUE="$(openssl rand -hex 32)"
if [[ ! -f "${STAGING}/.env.local" ]]; then
  cat >"${STAGING}/.env.local" <<EOF
HOME_ASSISTANT_URL=${HOME_ASSISTANT_URL:-}
HOME_ASSISTANT_TOKEN=${HOME_ASSISTANT_TOKEN:-}
TESLA_ENTITY_PREFIX=${TESLA_ENTITY_PREFIX:-}
TESLA_REFRESH_TOKEN=${TESLA_REFRESH_TOKEN:-}
TESLA_CLIENT_ID=${TESLA_CLIENT_ID:-}
TESLA_REGION=${TESLA_REGION:-na}
POLL_INTERVAL_SECONDS=${POLL_INTERVAL_SECONDS:-60}
AUTH_SECRET=${AUTH_SECRET_VALUE}
VOLTDESK_DATA_DIR=${APP_DIR}/data
EOF
  chmod 640 "${STAGING}/.env.local"
else
  grep -q '^AUTH_SECRET=' "${STAGING}/.env.local" || echo "AUTH_SECRET=${AUTH_SECRET_VALUE}" >>"${STAGING}/.env.local"
  grep -q '^VOLTDESK_DATA_DIR=' "${STAGING}/.env.local" || echo "VOLTDESK_DATA_DIR=${APP_DIR}/data" >>"${STAGING}/.env.local"
fi

msg "Building VoltDesk"
cd "${STAGING}"
if ! { if [[ -f package-lock.json ]]; then npm ci; else npm install; fi; npm run build; }; then
  if [[ "${HAD_PRIOR}" -eq 1 ]]; then rollback_prior; fi
  err "Build failed"
fi

systemctl stop voltdesk.service 2>/dev/null || true
rm -rf "${APP_DIR}"
mv "${STAGING}" "${APP_DIR}"

mkdir -p "${APP_DIR}/data"
chmod 750 "${APP_DIR}/data"

install -m 0755 "${APP_DIR}/scripts/voltdesk-user" /usr/local/bin/voltdesk-user
install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/update
install -m 0755 "${APP_DIR}/scripts/voltdesk-update" /usr/local/bin/voltdesk-update
chmod +x "${APP_DIR}/scripts/voltdesk-user.mjs" "${APP_DIR}/scripts/voltdesk-update.sh" || true

# First-start uses the /setup landing page — do not auto-create users
export VOLTDESK_DATA_DIR="${APP_DIR}/data"
if [[ -f "${APP_DIR}/data/users.json" ]] && grep -q '"username"' "${APP_DIR}/data/users.json" 2>/dev/null; then
  msg "Existing VoltDesk users preserved"
else
  msg "No users yet — open the app and complete first-start setup"
fi

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
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
msg "Installed — http://${IP:-<ct-ip>}:${APP_PORT}"
msg "First start: open the URL and create your username / password"
msg "Config: ${APP_DIR}/.env.local"
msg "Update: update   (backs up + auto-rolls back on failure)"
msg "Users:  voltdesk-user reset-password USERNAME  (hidden prompt, signs browsers out)"
CT_INSTALL_EOF
}

push_and_install() {
  local remote=/tmp/voltdesk-ct-install.sh
  local local_install
  local_install="$(mktemp)"
  write_ct_installer >"${local_install}"
  pct push "${CTID}" "${local_install}" "${remote}"
  pct exec "${CTID}" -- chmod +x "${remote}"
  rm -f "${local_install}"

  local -a env_vars=(
    "VOLTDESK_PORT=${VOLTDESK_PORT}"
    "VOLTDESK_BRANCH=${VOLTDESK_BRANCH}"
    "HOME_ASSISTANT_URL=${HOME_ASSISTANT_URL}"
    "HOME_ASSISTANT_TOKEN=${HOME_ASSISTANT_TOKEN}"
    "TESLA_ENTITY_PREFIX=${TESLA_ENTITY_PREFIX}"
    "TESLA_REFRESH_TOKEN=${TESLA_REFRESH_TOKEN}"
    "TESLA_CLIENT_ID=${TESLA_CLIENT_ID}"
    "TESLA_REGION=${TESLA_REGION}"
  )

  if [[ "${SOURCE_MODE}" == "local" ]]; then
    local archive="/var/tmp/voltdesk-${CTID}.tar.gz"
    msg_info "Packaging local source"
    tar -czf "${archive}" \
      --exclude='./node_modules' --exclude='./.next' --exclude='./.git' --exclude='./.cursor' \
      -C "${REPO_ROOT}" .
    pct push "${CTID}" "${archive}" /tmp/voltdesk-src.tar.gz
    rm -f "${archive}"
    env_vars+=("VOLTDESK_SOURCE_ARCHIVE=/tmp/voltdesk-src.tar.gz")
  else
    env_vars+=("VOLTDESK_REPO=${VOLTDESK_REPO}")
  fi

  msg_info "Installing inside CT ${CTID} (several minutes)"
  pct exec "${CTID}" -- env "${env_vars[@]}" bash "${remote}"
  msg_ok "${APP} installed"
}

done_msg() {
  local ip
  ip="$(pct exec "${CTID}" -- hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  msg_ok "${APP} is ready"
  echo "  URL    : http://${ip:-<ct-ip>}:${VOLTDESK_PORT}"
  echo "  Setup  : open the URL and create your username / password"
  echo "  Reset  : pct enter ${CTID}  then  voltdesk-user reset-password USERNAME"
  echo "  Update : pct enter ${CTID}  then  update"
  echo "  CT ID  : ${CTID}"
  echo "  Shell  : pct enter ${CTID}"
  echo "  Logs   : pct exec ${CTID} -- journalctl -u voltdesk -f"
  echo "  Env    : /opt/voltdesk/.env.local"
}

main() {
  need_proxmox
  resolve_local
  gather
  create_ct
  start_ct
  push_and_install
  done_msg
}

main "$@"
