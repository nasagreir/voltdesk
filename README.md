# VoltDesk

Self-hosted Tesla dashboard in the same shape as [OrbitDesk](https://github.com/nasagreir/orbitdesk): a Debian LXC on Proxmox, a pasteable installer, and an `update` command that backs up, swaps the release, health-checks, and rolls back if the new build fails.

VoltDesk covers the TeslaMate vehicle screens in its own UI:

- Garage: battery with a charging mark and a finish time, rated and ideal range plus a range from recent trips, a short charging highlight (state, power, and either the finish time or the energy added, plus the recent cost), climate, locks, sentry, tires, location, a studio photo of the model with a paint color for that car, a name you can set for that car, a daily driving chart on the odometer, a speed graph with the highest and average, and a history chart on the other garage readings, each with a date range back through about 400 days, plus the same date range on reports and the timeline, an optional 30-minute live view, a short suggestion list, service status, and a PNG share card of the stats you pick
- Charging: the live charge readings, power and rate history, cable and charge port, and charge cost by place (home, free work, Supercharger) with a guess you can replace by the amount you paid
- Trips: each drive on a street map, the stats for that drive, any date range within the stored history, and a PNG share card for one drive or for that date range
- Service: Tesla’s published maintenance intervals, with a place to mark each item done
- Charges and charge detail, split into AC and DC, with voltage, current, phases, and cost. Each charge keeps a best guess from the place rate until you enter the actual amount. Home and work locations on Connections tag those charges and drive the guess.
- Statistics, trip search, drive stats, charging stats, efficiency, battery health, charge level, projected range
- Vampire drain, states, mileage, temperatures, software updates, visited points, and a timeline
- Geofences with a per-place electricity rate and session fee, plus address lookup for spots outside a fence

The layout follows the iPhone Duo viewports from Safari 27.1: the 382px outer display (and Split View) keeps the bottom bar, the 669px inner display in portrait uses the top bar, and the 951px inner display in landscape puts the battery on one side of the hinge and the live stats on the other. Folded like a book, the header and that first row line up with the two viewport segments.

It stores about 400 days of samples. While the car is driving or charging it polls about every 15 seconds. While the car is parked or asleep it keeps your normal interval and does not wake the car. Live data stays off until you turn it on from the garage. That window lasts 30 minutes, wakes the car, and checks about every 15 seconds, which drains the battery faster, then turns itself off. That is polling, not TeslaMate's streaming websocket.

Not included, on purpose:

- Grafana
- An MQTT broker (Home Assistant or the Tesla Fleet API replaces it)
- TeslaFi or tesla-apiscraper import
- Translations (the UI is English)
- The TeslaMate database-information dashboard

With no Tesla or Home Assistant credentials it runs a demo Model Y so you can click through the UI. Secrets stay in `.env.local` or `data/settings.json` on the container. The browser only talks to VoltDesk.

Proxmox and Docker are two installs of this same app. A change to behavior, settings, port 3470, stored data, or the operator commands is made in both. The packages can differ: the LXC uses systemd and `/opt/voltdesk`, and Docker uses Compose and the `voltdesk-data` volume.

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

Open `http://<container-ip>:3470` and create your username and password. The installer does not set a container root password or a VoltDesk login. From the Proxmox host, the shell is `pct enter CTID`.

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

The sign-in page has the same commands under Forgot the password. There is no email reset.

```bash
pct enter CTID
voltdesk-user list
voltdesk-user reset-password ghull
# or: voltdesk-user create ghull
```

The prompt asks twice and does not echo. Press Enter to generate a password. A reset signs browsers out of that account. Type the username by itself. `<ghull>` is shell redirection. For a script, set `VOLTDESK_PASSWORD` instead of putting the password on the command line.

### People

Each login keeps its own Tesla. On Connections, add a person. They sign in and paste their own Fleet client id and refresh token. Home Assistant, places, charge prices, history, service files, and bot tokens stay with that login. The first account keeps the data that was already on the machine, including container variables such as `TESLA_REFRESH_TOKEN`. Another person's password is reset with `voltdesk-user reset-password`, the same command as before. `voltdesk-user create` adds a login from the shell too.

On Docker the same command is `docker compose exec voltdesk voltdesk-user`. Add `-it` when you want the hidden password prompt.

## Docker

This container runs the same VoltDesk as the Proxmox LXC. Port 3470, stored data, and the operator commands match. You need Docker Engine and the Compose plugin (`docker compose version`). The annotated file is [`compose.example.yaml`](compose.example.yaml). `docker compose up` reads [`compose.yaml`](compose.yaml), which is that same service.

### Install

On the machine that will run VoltDesk:

```bash
git clone https://github.com/nasagreir/voltdesk.git
cd voltdesk
cp .env.example .env
docker compose up -d --build
```

The first build compiles the Next.js app inside the image, so it takes a few minutes. When the container is healthy, open `http://<host>:3470` and create the username and password. The installer does not create a login. With `TESLA_CLIENT_ID` and `HOME_ASSISTANT_URL` left blank, that first account sees the demo Model Y until you paste a Fleet token or a Home Assistant token on Connections.

`0.0.0.0:3470` is published on every interface, same as the LXC. To keep the port on that machine only, set this in `.env` before you start:

```env
VOLTDESK_BIND=127.0.0.1
```

Check that it came up:

```bash
docker compose ps
docker compose logs -f voltdesk
```

`healthy` means `GET /api/auth/me` inside the container answered. Ctrl-C leaves the container running.

### What to put in `.env`

`.env.example` lists every setting. Compose loads `.env` when the file is present and starts without it. Common values:

```env
# Home Assistant. Use the LAN address. localhost inside the container is VoltDesk itself.
HOME_ASSISTANT_URL=http://192.168.1.20:8123
HOME_ASSISTANT_TOKEN=your-long-lived-token
TESLA_ENTITY_PREFIX=model_y

# Tesla Fleet API. The first login inherits these. Later logins start empty.
TESLA_CLIENT_ID=your-fleet-client-id
TESLA_REFRESH_TOKEN=your-refresh-token
TESLA_REGION=na

VOLTDESK_SOURCE=auto
ELECTRICITY_RATE_USD=0.16
```

Leave `AUTH_SECRET` as the placeholder in the example, or delete the line. A secret shorter than 16 characters is ignored. On first start the container writes a signing secret to `/data/auth-secret` in the volume. That file is not a login. Set your own only when you want browsers to keep working across a volume you restore onto another machine, and make it at least 16 characters.

On Linux, Home Assistant on the same host is not `localhost`. Use the host's LAN address, or uncomment `extra_hosts` in `compose.example.yaml` and set `HOME_ASSISTANT_URL=http://host.docker.internal:8123`.

You can put the same keys under `environment:` in the Compose file instead of `.env`. The example file shows them commented out. Do not commit a `.env` that has real tokens.

### Data

Users, each login's settings and history, service files, and the signing secret live in the `voltdesk-data` volume at `/data` inside the container. Per-login files are under `/data/users`. The process runs as uid 1001. The named volume is already writable by that user.

To keep the files in a folder you can see, create it and change the volume line as in `compose.example.yaml`:

```bash
sudo mkdir -p /srv/voltdesk/data
sudo chown 1001:1001 /srv/voltdesk/data
```

```yaml
volumes:
  - /srv/voltdesk/data:/data
```

A bind mount owned by root comes up and then cannot save a login.

### Accounts

```bash
docker compose exec voltdesk voltdesk-user list
docker compose exec -it voltdesk voltdesk-user reset-password ghull
docker compose exec voltdesk voltdesk-user create ada
```

Add `-it` when you want the hidden password prompt. `VOLTDESK_PASSWORD` sets it without a prompt. A reset signs browsers out of that account.

### Update

Pull the release and rebuild. The volume stays, including users and history.

```bash
git pull
docker compose up -d --build
```

There is no automatic image rollback on Docker. The LXC `update` command snapshots `/opt/voltdesk` and rolls back a failed build. On Docker, keep the previous image (`docker image ls voltdesk`) if you want a way back.

### Stop

`docker compose down` stops the container and keeps `voltdesk-data`. `docker compose down -v` deletes that volume, including users, history, and the signing secret.

### Live reload

For a checkout you are editing, the dev file listens on `127.0.0.1:3470` and mounts the source. Rebuild it after `package.json` changes. It is not loaded by `docker compose up`.

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

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

## Grok bot API

Connections can mint a read-only bearer token for a Grok bot. The bot can ask what the car is doing, how the last week looked, and list recent drives and charges. It cannot wake, unlock, or start the car, and the responses never include Tesla or Home Assistant secrets.

Open Settings, then Grok bot, to name a token, generate it, and copy it. The secret is shown once. You can keep several tokens. You can also set `VOLTDESK_API_TOKEN` in `.env.local`. A saved token and an environment token are both accepted. Revoke clears only the saved token you pick.

```bash
curl -s -H "Authorization: Bearer vd_…" http://localhost:3470/api/v1/summary
```

| Method | Path | Auth | Returns |
| --- | --- | --- | --- |
| GET | `/api/v1` | No | Endpoint list and a tool description. No vehicle data. |
| GET | `/api/v1/summary` | Bearer | One brief, current state, and the last 7 days. |
| GET | `/api/v1/vehicle` | Bearer | Current state. |
| GET | `/api/v1/drives?days=14` | Bearer | Recent drives. `days` is 1–90, and at most 20 are listed. |
| GET | `/api/v1/charges?days=14` | Bearer | Recent charges, same window. |

Creating or revoking a token is `POST /api/bot/token` and requires the VoltDesk login. Send `{ "name": "Grok bot" }` to create one, or `{ "revoke": true, "id": "…" }` to revoke one.

The same Grok bot page can store an xAI key (`XAI_API_KEY` or `GROK_API_KEY` in `.env.local` also works). With a key, the garage asks Grok for about three short suggestions from the car’s battery, tires, software, and service dates. Without a key, those notes are computed on the car and labeled that way. The request leaves out the VIN, Tesla and Home Assistant secrets, and home coordinates. Wake, unlock, and start stay off that call too.

## Service

Service follows Tesla’s published list: tire rotation every 6,250 mi, a cabin air filter every 2 years on Model 3 and Model Y (3 years on Model S and Model X), a brake fluid health check every 4 years, wiper blades about once a year, and brake caliper cleaning every year or 12,500 mi where roads are salted. Lubrication of the caliper pins applies only to a Model Y built through February 2025. Salted roads start on, because the default home is Chicago, and you can turn that item off. Marking an item done records today and the current odometer unless you type an earlier date or mileage. This is a reminder, not a substitute for Controls → Service → Maintenance in the car.

A service visit is one stop: a date, an odometer, the items covered, and the invoices. With Paperless-ngx connected, VoltDesk uploads each file through the Paperless API and puts two tags on it: the tag you set on Connections (default `VoltDesk`) and `vd-visit-` plus the visit id. The visit list is whatever Paperless has under that visit tag, so a file you tag by hand in Paperless shows up here too. Without Paperless, the file stays in `data/service-files` on this machine. Removing a document from a visit does not delete it from Paperless.

```env
PAPERLESS_URL=http://paperless.local:8000
PAPERLESS_TOKEN=your-api-token
PAPERLESS_TAG=VoltDesk
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev -- --port 3470 --hostname 0.0.0.0` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve on `0.0.0.0:3470` |
| `npm test` | Drive, charge, and report tests |
| `npm run user -- create admin` | Create a login from the CLI |
| `npm run user -- reset-password admin` | Reset a login. Inside the LXC the command is `voltdesk-user reset-password` |
| `update` | LXC update with backup and rollback |
| `bash proxmox-install.sh` | Pasteable Proxmox LXC installer |
| `docker compose up -d --build` | Production container on port 3470 |
| `docker compose exec voltdesk voltdesk-user list` | Accounts stored in the Docker volume |

## Layout

| Path | What it is |
| --- | --- |
| `/opt/voltdesk` | App directory inside the LXC |
| `/opt/voltdesk/.env.local` | Installer-written secrets |
| `/opt/voltdesk/data` | Users, settings, samples, geofences, address cache, maintenance, last report |
| `/etc/systemd/system/voltdesk.service` | systemd unit |
| `/usr/local/bin/update` | Updater |
| `proxmox-install.sh` | Single file you paste on the Proxmox host |
| `scripts/proxmox/ct-install.sh` | The same in-container install, kept readable |
| `Dockerfile` | Production image, plus a `dev` stage |
| `compose.yaml` | Container, port 3470, and the `voltdesk-data` volume. This is what `docker compose up` reads |
| `compose.example.yaml` | The same service with comments for bind mounts, `.env` keys, and a Home Assistant host route |
| `compose.dev.yaml` | Opt-in live reload. Not loaded by `docker compose up` |
