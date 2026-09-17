# Deployment

Single Hostinger VPS. Next.js, NestJS and Postgres all run as containers; **Caddy is the only
thing publishing host ports** and reverse-proxies to the other two.

---

## 1. GitHub secrets

Create these under **Settings → Secrets and variables → Actions**. The first deploy fails with
a list of any that are missing, so nothing half-ships.

| Secret | What it is | How to get it |
|---|---|---|
| `DOCKER_USERNAME` | Docker Hub username | your account |
| `DOCKER_SECRET` | Docker Hub access token | Docker Hub → Account Settings → Personal access tokens |
| `VPS_HOST` | Server IP | Hostinger hPanel |
| `VPS_USER` | `deploy` | created during server provisioning |
| `VPS_SSH_KEY_B64` | CI private key, base64, one line | `base64 -w0 ~/.ssh/lebanon-cleaning_deploy \| clip.exe` |
| `VPS_PORT` | Optional, defaults to 22 | — |
| `API_DOMAIN` | Bare hostname, no scheme | e.g. `api.cleaning.example.com` |
| `FRONTEND_DOMAIN` | Bare hostname, no scheme | e.g. `app.cleaning.example.com` |
| `ACME_EMAIL` | Real address for Let's Encrypt expiry notices | — |
| `POSTGRES_PASSWORD` | Database password | `openssl rand -base64 48` |
| `SESSION_SECRET` | Signs session cookies | `openssl rand -base64 48` |
| `GOOGLE_MAPS_SERVER_KEY` | Server key: Routes + Geocoding | §3 below. Leave empty to run on estimates |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Browser key: Maps JS + Places | §3 below. Leave empty for the built-in map |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Map ID for Advanced Markers | §3 below |

Use `openssl rand -base64 48` for anything random: base64 contains no `$` or `#`, so it cannot
be mangled by env parsing.

> **`NEXT_PUBLIC_*` values are inlined when the image is BUILT.** Changing one requires a
> redeploy, not a restart — a restart changes nothing and looks like the value was ignored.

---

## 2. One-time server provisioning

Follow `~/playbooks/DEPLOY-PLAYBOOK.md` §2 in full: patch and reboot, set the timezone, add 2 GB
of swap, install Docker **with log rotation**, create the `deploy` user in the `docker` group,
enable UFW (SSH **first**), install fail2ban and unattended-upgrades.

Then measure UDP/443 before trusting HTTP/3 (playbook §7). If it is dropped, uncomment the
`protocols h1 h2` block in `infra/Caddyfile` **and** remove the `443:443/udp` mapping from
`infra/docker-compose.prod.yml` — never one without the other, because browsers cache the
`alt-svc` advertisement for up to 30 days.

> **UFW does not protect containers.** Docker writes its own iptables rules and bypasses UFW for
> published ports. The real boundary is the compose file: only Caddy publishes anything.

**DNS:** point both `API_DOMAIN` and `FRONTEND_DOMAIN` at the server's IP before the first
deploy, or Caddy cannot complete the ACME challenge and TLS will not be issued.

---

## 3. Google Maps Platform setup — OPTIONAL

**Skip this entirely unless you want it.** The app ships with a real OpenStreetMap map that
needs no account, no API key and no billing, and estimates distances from straight-line geometry
inflated by a road factor.

What Google adds, and nothing else: real road driving distances and times instead of estimates,
its own basemap, and address autocomplete. It requires a Google Cloud **billing account** (a card
on file) even though a single team's usage sits inside the free allowances — that is Google's
rule, not ours: without billing enabled the Maps APIs return nothing at all.

1. Create a Google Cloud project and **enable billing** — nothing works without it.
2. Enable exactly four APIs: **Maps JavaScript API**, **Places API (New)**, **Geocoding API**,
   **Routes API**.
3. Create **two** keys, never one:
   - **Browser key** → restrict by HTTP referrer (`https://app.example.com/*`), restrict to
     *Maps JavaScript API* + *Places API (New)*. Give the full referrer string including the
     scheme; browsers omit the `Referer` header cross-origin otherwise.
   - **Server key** → restrict by the VPS's IP, restrict to *Routes API* + *Geocoding API*.
     This key never reaches a browser.
4. Create a **Map ID** (vector) and attach a light, minimal style in the Cloud console.
   Advanced Markers require a Map ID, and inline `styles[]` was decommissioned in 2025, so map
   styling lives there rather than in code.

### Keeping the bill at zero

Free allowances reset monthly and are **per SKU**: Essentials 10,000, Pro 5,000, Enterprise
1,000. (The old flat $200 credit was withdrawn in March 2025.) At this volume everything sits
inside Essentials, so the expected spend is **$0/month** — provided nothing silently promotes a
request to a higher SKU:

| Do not | Because |
|---|---|
| Set `routingPreference: TRAFFIC_AWARE` | Essentials → Pro, double price, and it makes travel time depend on departure time, which breaks the zero-call time slider |
| Use `optimizeWaypointOrder` | Essentials → Pro |
| Send more than 10 intermediate waypoints | Essentials → Pro |
| Request tolls or traffic-on-polyline | → Enterprise, triple price |
| Add `displayName` to a Place Details field mask | Essentials $5 → Pro $17 per 1,000 |
| Use a wildcard field mask anywhere | Unbounded: new Google features raise your bill silently |

After a week, check **Cloud Console → Metrics Explorer** per SKU. A Pro or Enterprise line item
means a field mask has leaked.

---

## 4. First deploy

```bash
git checkout -b production && git push -u origin production
```

`main` never deploys — it is the integration branch. Pushing `production` runs the checks, builds
both images, ships them, migrates, and health-gates. `workflow_dispatch` lets you redeploy or
roll back without an empty commit.

### Create the first staff account

Demo data is never seeded in production; the seed script refuses to run there. Create the first
user explicitly:

```bash
ssh deploy@<ip>
cd ~/lebanon-cleaning
docker compose run --rm \
  -e ADMIN_EMAIL='you@example.com' \
  -e ADMIN_NAME='Your Name' \
  -e ADMIN_PASSWORD='<at least 12 characters>' \
  -w /app/apps/api api npm run bootstrap:admin </dev/null
```

Then sign in and set the depot coordinates, workday hours and planning areas under **Settings**.

---

## 5. Verify the deployment

Run this **in the deployed browser**, not locally:

> **Sign in → HARD REFRESH → make a booking.**

The refresh is the load-bearing step: it throws away whatever the page held in memory and forces
it to re-derive its session the way a cold visitor would. Logging in alone proves nothing,
because the login response hands the page everything it needs. Run this whenever the hosting
shape changes — new domain, a CDN added in front, cookie settings touched.

Then confirm the product actually works: on a day that already runs Khalde → Saida → Nabatieh,
book another Khalde customer available late afternoon. The system should **offer a slot on the
return journey** rather than refusing it because Khalde already appears.

---

## 6. Rollback

Every deploy tags the images with the commit SHA, and that tag is the rollback unit.

```bash
ssh deploy@<ip>
cd ~/lebanon-cleaning
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG='<previous-sha>'/" .env
docker compose up -d
```

Migrations are **not** rolled back automatically. Before any schema change on live data, take a
backup first (§7).

---

## 7. Backups and monitoring — set up once the app is live with real data

Deliberately left until the app is working with real clients.

```bash
# Nightly, uploaded OFFSITE — a backup on the same disk protects against nothing that matters.
docker compose exec -T postgres pg_dump -U lebanon -Fc lebanon_cleaning | gzip > backup-$(date +%F).dump.gz
```

Keep 7 daily and 4 weekly. **A backup that has never been restore-tested does not exist** — test
one into a scratch container. The `caddy_data` volume matters too: losing it means reissuing
certificates and risking rate limits.

Add an external uptime check against `https://<API_DOMAIN>/api/health`. The server cannot report
its own death.
