#!/usr/bin/env bash
# Compatibility wrapper — the single pasteable installer lives at repo root:
#   proxmox-install.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec bash "${ROOT}/proxmox-install.sh" "$@"
