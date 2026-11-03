# VoltDesk on Proxmox

## Paste this on the Proxmox host (root)

One file: [`proxmox-install.sh`](../../proxmox-install.sh) at the repo root.

### One-liner (raw URL)

```bash
# Automatic (no prompts)
bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/voltdesk/main/proxmox-install.sh)" -- --yes

# Interactive
bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/voltdesk/main/proxmox-install.sh)"
```

Repo: https://github.com/nasagreir/voltdesk

Templates download to a **vztmpl** store (`local`); the CT disk uses a **rootdir** store (`local-lvm` / `local-zfs`).

### Or paste the whole script

1. Open [`proxmox-install.sh`](../../proxmox-install.sh)
2. Paste the entire file into the Proxmox host shell and press Enter

### Or from a host clone

```bash
git clone https://github.com/nasagreir/voltdesk.git /root/voltdesk
bash /root/voltdesk/proxmox-install.sh
```

(Local clone copies the tree into the CT without re-cloning from GitHub inside the CT.)

## After install

Open `http://<container-ip>:3470` and create your username and password on the first-start page.

```bash
pct enter <CTID>
systemctl status voltdesk
nano /opt/voltdesk/.env.local
systemctl restart voltdesk

# Password recovery from the LXC shell. The prompt is hidden and signs browsers out.
voltdesk-user list
voltdesk-user reset-password admin
voltdesk-user create alice
```
