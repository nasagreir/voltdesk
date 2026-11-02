# VoltDesk

Self-hosted Tesla dashboard in the same shape as [OrbitDesk](https://github.com/nasagreir/orbitdesk): a Debian LXC on Proxmox, a pasteable installer, and an `update` command that backs up, swaps the release, health-checks, and rolls back if the new build fails.

VoltDesk tracks the things TeslaMate keeps on the garage screen:

- Battery, rated range, and estimated range
- Charge power, rate, limit, energy added, and time to the limit
- Cabin and outside temperature, climate, locks, sentry, doors, and tire pressures
- Location, with a home geofence
- Drives and charge sessions derived from the samples it stores
- 24 hour, 7 day, and 14 day history

With no Tesla or Home Assistant credentials it runs a demo Model Y so you can click through the UI. Secrets stay in `.env.local` or `data/settings.json` on the container. The browser only talks to VoltDesk.

## Install on Proxmox

Repo: [github.com/nasagreir/voltdesk](https://github.com/nasagreir/voltdesk)

On the **Proxmox host** as root:

```bash
# Fully automatic
bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/voltdesk/main/proxmox-install.sh)" -- --yes

# Or interactive prompts
bash -c "$(curl -fsSL https://raw.githubusercontent.com/nasagreir/voltdesk/main/proxmox-install.sh)"
```

The installer picks template storage (`local` / vztmpl) separately from rootfs storage (`local-lvm` / rootdir), creates an unprivileged Debian 12 LXC (`nesting=1`, DHCP on `vmbr0`, 2 cores, 2 GiB RAM, 8 GiB disk), builds VoltDesk, and enables `voltdesk.service` on port **3470**.

From a clone already on the host, the script copies that tree into the container instead of cloning again:

```bash
git clone https://github.com/nasagreir/voltdesk.git /root/voltdesk
bash /root/voltdesk/proxmox-install.sh
```

Open `http://<container-ip>:3470` and create your username and password. Nothing is auto-provisioned.

Push this project to `nasagreir/voltdesk` (or set `VOLTDESK_REPO`) before the curl one-liner can clone it. Until then, run the installer from a local clone.

### Update

Inside the LXC:

```bash
pct enter CTID
update
# optional: update --branch main
```

`voltdesk-update` is the same command. It snapshots the live install under `/var/backups/voltdesk/` and `/opt/voltdesk.previous`, builds the new release in staging, swaps it in, then health-checks `http://127.0.0.1:3470/api/auth/me`. A failed build or health check restores the previous version. `.env.local` and `data/` (users, settings, history) are kept.

### Password recovery

```bash
pct enter CTID
voltdesk-user list
voltdesk-user reset-password ghull
# or: voltdesk-user create ghull
```

Type the username by itself. `<ghull>` is shell redirection.

## Quick start (local)

```bash
npm install
cp .env.example .env.local
# set AUTH_SECRET in .env.local
npm run dev -- --port 3470 --hostname 0.0.0.0
```

Open [http://localhost:3470](http://localhost:3470). With no users yet you land on the setup page.

## Connect the car

### Home Assistant

This matches OrbitDesk. Install a Tesla integration so entities like `sensor.model_y_battery` exist, create a long-lived access token, then set:

```env
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=your-token
TESLA_ENTITY_PREFIX=model_y
```

`model_y` is the prefix of `sensor.model_y_battery`. Several cars can be comma-separated. Leave the prefix blank and VoltDesk will look for Tesla battery entities on its own.

### Tesla Fleet API

Create an app at [developer.tesla.com](https://developer.tesla.com), complete Tesla's authorization-code login for that app, and paste the client id plus refresh token on Connections (or into `.env.local`). VoltDesk reads vehicle data and can send wake. It does not unlock the car or start it.

```env
TESLA_CLIENT_ID=your-fleet-client-id
TESLA_REFRESH_TOKEN=your-refresh-token
TESLA_REGION=na
```

Regions: `na`, `eu`, `cn`. If a refresh token rotates, VoltDesk stores the new one in `data/settings.json`.

Auto mode tries Tesla first, then Home Assistant, then the demo car. Asleep cars keep the last saved report instead of waking themselves.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev -- --port 3470 --hostname 0.0.0.0` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve on `0.0.0.0:3470` |
| `npm test` | Drive and charge session tests |
| `npm run user -- create admin` | Create a login from the CLI |
| `update` | LXC update with backup and rollback |
| `bash proxmox-install.sh` | Pasteable Proxmox LXC installer |

## Layout

| Path | What it is |
| --- | --- |
| `/opt/voltdesk` | App directory inside the LXC |
| `/opt/voltdesk/.env.local` | Installer-written secrets |
| `/opt/voltdesk/data` | Users, settings, samples, last report |
| `/etc/systemd/system/voltdesk.service` | systemd unit |
| `/usr/local/bin/update` | Updater |
| `proxmox-install.sh` | Single file you paste on the Proxmox host |
| `scripts/proxmox/ct-install.sh` | The same in-container install, kept readable |
