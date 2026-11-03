# VoltDesk

Self-hosted Tesla dashboard in the same shape as [OrbitDesk](https://github.com/nasagreir/orbitdesk): a Debian LXC on Proxmox, a pasteable installer, and an `update` command that backs up, swaps the release, health-checks, and rolls back if the new build fails.

VoltDesk covers the TeslaMate vehicle screens in its own UI:

- Garage: battery, rated, ideal, and estimated range, charge detail, climate, locks, sentry, tires, location
- Drives and drive detail, including route, speed, power, elevation, and net versus gross Wh per mile
- Charges and charge detail, split into AC and DC, with voltage, current, phases, and cost
- Statistics, trip search, drive stats, charging stats, efficiency, battery health, charge level, projected range
- Vampire drain, states, mileage, temperatures, software updates, visited points, and a timeline
- Geofences with a per-place electricity rate and session fee, plus address lookup for spots outside a fence

The layout follows the iPhone Duo viewports from Safari 27.1: the 382px outer display (and Split View) keeps the bottom bar, the 669px inner display in portrait uses the top bar, and the 951px inner display in landscape puts the battery on one side of the hinge and the live stats on the other. Folded like a book, the header and that first row line up with the two viewport segments.

It stores about 400 days of samples. While the car is driving or charging it polls about every 15 seconds. While the car is parked or asleep it keeps your normal interval and does not wake the car. That is polling, not TeslaMate's streaming websocket.

Not included, on purpose:

- Grafana
- An MQTT broker (Home Assistant or the Tesla Fleet API replaces it)
- TeslaFi or tesla-apiscraper import
- Translations (the UI is English)
- The TeslaMate database-information dashboard

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
| `npm test` | Drive, charge, and report tests |
| `npm run user -- create admin` | Create a login from the CLI |
| `update` | LXC update with backup and rollback |
| `bash proxmox-install.sh` | Pasteable Proxmox LXC installer |

## Layout

| Path | What it is |
| --- | --- |
| `/opt/voltdesk` | App directory inside the LXC |
| `/opt/voltdesk/.env.local` | Installer-written secrets |
| `/opt/voltdesk/data` | Users, settings, samples, geofences, address cache, last report |
| `/etc/systemd/system/voltdesk.service` | systemd unit |
| `/usr/local/bin/update` | Updater |
| `proxmox-install.sh` | Single file you paste on the Proxmox host |
| `scripts/proxmox/ct-install.sh` | The same in-container install, kept readable |
