# Turning on Google Maps

Follow this once. It takes about 15 minutes, and at the end you run one command that tells you
whether it worked.

**What you get:** real road driving distances and times instead of straight-line estimates,
Google's basemap, and address autocomplete.

**What it costs:** nothing at one team's volume — but Google requires a credit card on file
before the Maps APIs return anything at all, even inside the free tier. Step 7 puts a hard stop
on spending so that card can't be surprised.

---

## 1. Create a project

Go to <https://console.cloud.google.com/>.

Top bar → the project dropdown → **New Project**. Name it something like `lebanon-cleaning`.
Create it, then **make sure it is the selected project** in that dropdown before doing anything
else. Almost every "it doesn't work" ends up being settings applied to the wrong project.

## 2. Enable billing

Left menu → **Billing** → **Link a billing account** → add a card.

This feels wrong when the thing is supposed to be free. It is how Google works: with no billing
account the Maps APIs return errors, not results. Steps 7 and 8 are what keep it safe.

### If you see "Unable to enable billing — you have reached the limit of projects"

Google caps how many projects a single billing account may cover, and other projects you own
are already using those slots. **Do not wait on a quota increase** — it can take days and may be
refused. Two faster ways out, in order of preference:

1. **Reuse a project that already has billing.** You do not need a fresh project at all. Pick an
   existing billing-enabled one, enable the four APIs from step 3 on it, and create the keys
   there. Because both keys are tightly restricted (steps 4 and 5), sharing a project with
   another app of yours is fine.
2. **Free a slot.** Billing → *Manage billing accounts* → *My projects* shows everything
   consuming a slot. Disable billing on a project you no longer use.

Requesting the quota increase is worth doing as well, but treat it as the slow path.

## 3. Enable exactly four APIs

**APIs & Services → Library**, then search for and **Enable** each of these:

| API | What it does for us |
|---|---|
| **Maps JavaScript API** | draws the map |
| **Routes API** | real driving distance and time |
| **Geocoding API** | turns "Tripoli, Mina" into coordinates |
| **Places API (New)** | address autocomplete — note **(New)**, not the old one |

Enable only these four. Anything else is surface area you are not using.

## 4. Create the SERVER key

**APIs & Services → Credentials → Create credentials → API key.** Copy it, then click
**Edit API key**:

- **Name:** `server-key`
- **Application restrictions:** *IP addresses* → add your VPS's IP.
  *While testing locally, add your own public IP too — find it with `curl ifconfig.me`.*
- **API restrictions:** *Restrict key* → tick **Routes API** and **Geocoding API** only.

Save. This key does the paid work and must **never** reach a browser.

## 5. Create the BROWSER key

**Create credentials → API key** again. A second key, not the same one. Edit it:

- **Name:** `browser-key`
- **Application restrictions:** *Websites* → add:
  - `https://your-frontend-domain.com/*`
  - `http://localhost:4101/*` (for local testing)
  - Include the `https://` — browsers omit the referrer header otherwise and Google rejects it.
- **API restrictions:** tick **Maps JavaScript API** and **Places API (New)** only.

This one is visible in the browser, which is fine: the restrictions are what protect it.

## 6. Create a Map ID

**Google Maps Platform → Map Management → Create Map ID.**

- **Name:** `lebanon-cleaning`
- **Map type:** *JavaScript* → **Vector**

Copy the Map ID. This is **required** — the custom numbered pins will not render without one,
and Google removed the old way of styling maps from code in 2025. Styling now lives here:
**Map Styles → Create Style** → start from a light/minimal template, associate it with your
Map ID.

## 7. Cap the spending — do not skip this

**APIs & Services → each API → Quotas & System Limits.**

For **Routes API**, **Geocoding API** and **Places API**, set the *requests per day* cap to
something you would never legitimately reach — **1,000/day is generous** for one team.

This is the real safety net, and it is different from a budget alert: a quota cap **stops**
requests. It cannot bill you for traffic it refused to serve.

## 8. Add a budget alert as a second net

**Billing → Budgets & alerts → Create budget.** Set it to **$5/month**, alert at 50% and 100%.

You should never see this fire. If it does, something is wrong and you want to know on day one
rather than at the end of the month.

## 9. Put the three values in `.env`

```bash
GOOGLE_MAPS_SERVER_KEY='<the server key from step 4>'
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY='<the browser key from step 5>'
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID='<the Map ID from step 6>'
```

## 10. Check it

```bash
npm run check:google
```

This calls each API for real and tells you precisely what is wrong if anything is — "that API
is not enabled", "this is the browser key, not the server key", "billing is not enabled" — so
you are never guessing at a `REQUEST_DENIED`.

When it passes it also prints how far off the old estimate was, which is the whole point of
doing this.

## 11. Restart — the whole thing, not just the API

```bash
# Ctrl-C the running npm run dev first, then:
npm run dev
```

**This matters more than it sounds.** The environment is read once, when the process starts.
Nest's file-watcher restarts your *code* when it changes, but it does not re-read `.env` — so
editing `.env` while `npm run dev` is running changes nothing, and the app keeps quietly
estimating with no clue why. Stop it fully and start it again.

You will know it worked from the API's own log line on boot:

```
[RoutingModule] Using Google Routes for real road distances.
```

If it instead says *"No GOOGLE_MAPS_SERVER_KEY"*, the restart did not pick up the file.

### Clear the old estimates

Distances are cached, so legs measured before Google was connected stay as estimates. Flush
them once:

```bash
npm run cache:clear
```

---

## If something is wrong

Run `npm run check:google` first — it diagnoses the common cases directly. Beyond that:

| What you see | What it means |
|---|---|
| Map area is grey, console says `RefererNotAllowedMapError` | The browser key's website restriction does not match the URL you are on. Add it, including the scheme. |
| Map loads but the numbered pins are missing | The Map ID is missing or wrong. Advanced Markers require it. |
| Distances still say "Estimated" | The API did not restart, or the server key failed. Run the checker. |
| Everything worked, then stopped | You hit a quota cap from step 7. Raise it if the usage was genuine. |

**Nothing breaks if Google fails, and the two halves fail independently.**

- If the **server key** cannot reach the Routes API, distances fall back to straight-line
  estimates and the summary bar says *"Estimated distances"*.
- If the **browser key** cannot load the Maps JavaScript API — which also needs billing — the
  map silently falls back to the OpenStreetMap basemap. No error, no blank rectangle.

So a half-finished Google setup degrades one piece at a time rather than breaking the app. You
can be on real road distances while still showing the free basemap, which is exactly what
happens when billing is enabled for Routes but not yet for Maps JavaScript.

---

## Later: pushing the schedule to Google Calendar

Not built yet, and nothing here needs changing for it. Two things worth knowing now so you do
not have to redo anything:

- **Use this same Cloud project.** The Calendar API is enabled from the same Library page in
  step 3. Do not make a second project for it.
- **It needs a different kind of credential.** API keys only work for public data; writing to a
  calendar needs OAuth (sign in once and grant access) or a service account with the calendar
  shared to it. That is the main piece of work, not the syncing itself.

On our side it is a small addition: appointments already are the single source of truth, so
syncing is one module that watches them and mirrors each one into a calendar event. The only
schema change is one nullable column holding the calendar's event id per appointment, so an
edit updates the existing event instead of creating a duplicate. Deliberately not added yet —
it is a five-minute migration when the feature is actually wanted.

One real detail to get right at that point: appointments are stored as a local date plus minutes
since midnight (so a government DST change can never shift a booking), while Calendar wants a
real timestamp with a timezone. That conversion belongs in the sync module and nowhere else.
