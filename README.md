# Lebanon Cleaning — Route-Aware Reservation System

A scheduling tool for a cleaning team working across Lebanon. The point is not booking; it is
**booking while watching what that booking does to the whole day's Beirut → … → Beirut loop.**

A customer calls and says they're free from 4pm. You type their location, and the app tells you
which times work, what each one costs in extra driving, and when the team gets home — before you
promise anything.

---

## What makes it work

**The route is not stored. The route *is* the day's appointments sorted by time.** There is no
sequence table to drift out of sync, and re-ordering the route simply means changing appointment
times — which matches reality, since the time *is* what the customer was told.

**The same place can appear twice in a day.** Khalde at 10:00 on the way out and Khalde again at
17:00 on the way home is an ordinary result, not a special case: nothing in the engine tracks
which places have been visited. The second Khalde slot ranks *well* because the arithmetic likes
it — it is barely a detour on the way home.

**Suggestions are ranges, not a handful of times.** If the only workable window is 13:42–13:51,
a list of round clock times would report "no availability" for a slot that genuinely exists.

**It runs with no Google account, and no account of any kind.** The map is real
OpenStreetMap data — streets, towns, the coast road — needing no API key and no billing, and
distances are estimated from straight-line geometry. Adding a Google Maps key later swaps in
Google's basemap and real road distances behind the same interface, changing nothing else.

---

## Running it locally

Requires Node 22 and Docker.

```bash
cp .env.example .env
docker compose up -d          # Postgres on 5433
npm install
npm run build --workspace @lebanon/contracts
npm run db:migrate            # applies migrations
npm run db:seed               # planning areas, localities, a demo day, a demo login
npm run dev                   # API on :4100, web on :4101
```

Open http://localhost:4101 and sign in with **admin@gmail.com / loadless**.

The seeded day is the scenario from the brief — Khalde 10:00, Saida 12:30, Nabatieh 15:00. Add a
Khalde customer available late afternoon and the app offers a slot on the return journey.

### Commands

| | |
|---|---|
| `npm run dev` | both apps with hot reload |
| `npm test` | the scheduling engine — no database, no network |
| `npm run typecheck` | every workspace |
| `npm run db:migrate` | apply migrations |
| `npm run db:studio` | browse the database |

---

## Layout

```
apps/api          NestJS — the engine, the API, provider integrations
apps/web          Next.js — the scheduling workspace
packages/contracts  Zod schemas shared by both, so validation is written once
infra/            Caddyfile and the production compose file
```

Inside the API, one boundary matters most:

```
src/domain/       pure TypeScript — no NestJS, no Prisma, no Google types
src/modules/      controllers and application services
src/infrastructure/  Prisma, routing and geocoding adapters
```

`domain/` importing nothing is what lets the entire scheduling engine be tested with
hand-written distances in a third of a second. On the web side the same rule applies to the map:
only `features/map/google/**` may import `google.maps`.

---

## How the engine thinks

Given a day's appointments and a table of travel times, it walks the day forward and reports
exactly what will happen — arrival, waiting, overruns, and when the team gets back.

To place a new customer it scans every gap in the day. For each one it computes the range of
start times that genuinely work, bounded by the customer's availability, the drive from the
previous stop, and **the drive to the next one plus that visit's own duration**. That last part
is the subtle bit: bounding only by "the next appointment's time" would promise a slot that
makes an already-confirmed customer late.

Because every existing appointment is pinned to a promised time, each one acts as a barrier that
stops delay cascading — so each gap can be judged against just its two neighbours, exactly, in
constant time.

Gaps are then ranked by what they cost **the day**, not by raw driving: a gap holding two hours
of dead waiting absorbs a job for free, while the same job in a tight final gap pushes the return
home by an hour.

When nothing fits, it looks for a slot that opens if one flexible customer moves inside their
own stated availability — *"works if you move Mrs Haddad 12:00 → 13:20. One call."*

---

## Locations in Lebanon

Lebanon has no widely-used street addressing, so customers send whatever they have: a WhatsApp
Maps link, "Tripoli, Mina", a landmark, a Plus Code, or nothing but a town name. One field
accepts all of them, and every path ends at the same draggable pin.

Precision is a ladder, not a yes/no — `LOCALITY` (~3 km) → `SUBLOCALITY` (~800 m) → `LANDMARK`
(~150 m) → `EXACT` — and **every level books normally.** Refusing a booking because the customer
only said "Saida" would be useless mid-phone-call. Instead the map draws a confidence circle
sized to what we actually know, and the day view lists which stops still need a real pin, so
someone can call back before the crew leaves.

---

## Turning on Google Maps (optional)

Real road distances instead of estimates, Google's basemap, and address autocomplete — free at
one team's volume. Step-by-step in [GOOGLE-SETUP.md](GOOGLE-SETUP.md), then:

```bash
npm run check:google   # calls each API and says exactly what is wrong, if anything
```

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md): secrets, server provisioning, the Google Cloud setup, and
how to keep the Maps bill at zero.
