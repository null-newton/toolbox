# Toolbox

A personal utilities website. Each utility can save its configuration to your
user account, backed by Supabase (auth + Postgres).

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (or reuse one).
2. **Run the schema**: open the SQL Editor in the Supabase dashboard and run
   [supabase/schema.sql](supabase/schema.sql). This creates the `utility_configs`
   table with Row Level Security so users can only access their own configs.
3. **Configure credentials**: copy `.env.example` to `.env` and fill in your
   project URL and anon/publishable key (Dashboard → Project Settings → API).
4. **Email confirmation (optional)**: by default Supabase requires users to
   confirm their email before logging in. Toggle this under
   Authentication → Providers → Email → "Confirm email".

```sh
npm install
npm run dev
```

### Open a tool without the sidebar

Append `?sidebar=hidden` to a tool's hash route, for example:

```text
https://your-toolbox-site/#/tools/qr-code?sidebar=hidden
```

Use `&sidebar=hidden` if the route already has query parameters. The parameter
goes **after the `#`**, because the app uses hash routing. It hides the desktop
sidebar and mobile menu bar without changing your saved sidebar preference.
Visitors who are not logged in see the login page first, including for tools
that normally allow guest access. After login, they return to the requested
tool with its query parameters preserved. Removing the parameter restores the
normal layout.

### Edge functions

Five utilities call Supabase edge functions (in [supabase/functions/](supabase/functions/)).
Deploy them with the Supabase CLI:

```sh
npx supabase functions deploy cors-proxy     # Shortest Route shared-list import
npx supabase functions deploy soccer         # Soccer Predictor fixtures + win %
npx supabase functions deploy fmp            # Stock Forecast (FMP source)
npx supabase functions deploy yahoo          # Stock Forecast (Yahoo source)
```

#### Self-hosted backend (currently in use)

Live Lyrics has two switchable modes: audio fingerprint recognition and
**Speech to lyrics**. The latter uses browser speech recognition, searches
[Unison](https://github.com/better-lyrics/unison#search-lyrics) by the detected
words, retrieves its complete lyrics, and follows matching lines while the
microphone stays on. It supports plain text, LRC, and TTML. Repeated choruses
can be anchored by tapping a line. Choose the song language before starting.
Browser speech support and transcription of singing vary; microphone access
requires HTTPS or localhost.

Both Unison phrase search and the LRCLIB title/artist fallback are free public
read APIs, with no API key or paid subscription to configure. Deploy the
updated backend and frontend together. Unison's community catalog may not
contain every song, and the service may rate-limit requests; users can correct
the phrase or select a song by title/artist instead. Unison results display
its required attribution. Browser speech services may process audio remotely;
the interface explains where detected text is sent.

Check the lyric parser and phrase alignment with
`node --test test/lyrics.test.mjs` (Node 22.18+).

These functions also run as a self-hosted backend — a zero-dependency Node
server that ports the edge functions and additional server-side utilities,
running on the fileserver machine and exposed via
its Cloudflare Tunnel at **`https://api.zacsvae.com/functions/v1`**. The frontend
routes to it through the `VITE_FUNCTIONS_URL` repo Variable (falls back to the
Supabase edge functions when unset). Auth and config storage stay on Supabase
either way.

**The backend lives in a separate private repo**,
[IsaacSauer/toolbox-backend](https://github.com/IsaacSauer/toolbox-backend),
checked out and run on the fileserver box. This public frontend repo deploys to
GitHub Pages on push to `main`; the two are decoupled at runtime (the frontend
only reaches the backend through the `VITE_FUNCTIONS_URL` URL). So if you build a
tool that needs new backend functionality: add the function in the
`toolbox-backend` repo, `git push` there, then apply it on the fileserver box
with its `deploy.sh` (pull + restart). Full workflow and how-to-add-a-function
are in that repo's README.

The account-free File Transfer utility always uses this self-hosted backend. It
stores anonymous, expiring transfers on the server's local disk; configure a
persistent writable `FILE_TRANSFER_DIR` on the fileserver as documented in the
backend README.

The account-free AI Image Upscaler also requires the self-hosted backend. It
streams images to a temporary anonymous job and runs the official Real-ESRGAN
NCNN Vulkan engine. Install the binary/models and configure the backend as
documented in its `IMAGE_UPSCALER.md`; inputs and results expire automatically.

The Weather utility also uses the self-hosted backend. Open-Meteo provides place
search plus current/hourly/10-day forecasts without a user API key. Its
"Typical day" view uses NOAA GHCN-Daily station observations: the backend finds
a suitable nearby station, reads its quality-controlled daily maximum/minimum
record, and returns medians, an 80% range, records, and year-by-year values.
Saved cities, last location, units, and the selected calendar day are stored in
the existing Supabase `utility_configs` table with per-user RLS; weather data is
not copied into Supabase.

Stock Forecast reads daily prices from two sources picked per user: `yahoo`
(keyless, unofficial Yahoo Finance API, all markets) and `fmp` (the user's own free
[Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs)
key, saved to their account config and forwarded per request).

The `soccer` function needs no secrets — each user enters their own
[football-data.org](https://www.football-data.org/client/register) API token in
the utility, which is saved to their account config (RLS-protected) and
forwarded to the function per request. The free tier covers 12 major
competitions for the current season (10 requests/minute, no daily cap); it does
not include line-ups, so the win % and predicted scoreline are built from recent
goals and head-to-head only.

## Database migrations

Schema changes live in [supabase/migrations/](supabase/migrations/), one file per
change, named `YYYYMMDDNNNN_short_name.sql`. The safest way to apply them to the
live project is the Supabase CLI. It records what has run in the remote
`supabase_migrations.schema_migrations` table, so each file is applied exactly
once and in order.

### Rules

- **Never edit or rerun a migration that has been applied.** Fix mistakes with a
  new migration. Some older files, such as the accounts migration, fail or do
  damage if they run twice.
- **Make new migrations safe to rerun** where you can: `create … if not exists`,
  `insert … on conflict do nothing`, `drop … if exists`.
- **Apply the migration before shipping code that needs it.** Every push to
  `main` deploys the frontend (see `.github/workflows/deploy.yml`), so push the
  migration first and merge afterwards.
- **Keep secrets and dumps out of git.** `supabase/.temp/` (the linked project) is
  already ignored. Database dumps contain user data, so store them outside the
  repository.

### Quick way

For the usual case (new migration files, history already in sync), run:

```sh
npm run db:push
```

[scripts/db-push.sh](scripts/db-push.sh) shows a dry run, asks for
confirmation, pushes, and then prints the migration history. To skip the
question, use `./scripts/db-push.sh --yes`. Use the steps below the first time,
or when `migration list` shows anything unexpected.

### Step by step

The CLI runs through `npx`, so nothing needs installing globally. Run these from
the repository root. Since CLI v3, database commands target a **local** database
unless you pass `--remote`. Every command below includes it, so they run against
the linked project.

1. **Log in and link the project** (one time per machine). You will be asked for
   the database password, which is under Dashboard → Project Settings → Database.

   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

2. **Back up first.** On the free plan this is your only backup.

   ```sh
   npx supabase db dump --remote -f ~/supabase-backups/schema-$(date +%F).sql
   npx supabase db dump --remote --data-only -f ~/supabase-backups/data-$(date +%F).sql
   ```

3. **Compare local and remote.**

   ```sh
   npx supabase migration list --remote
   ```

   Every file should either appear in both columns (already applied) or only in
   *Local* (new). Stop if something appears only in *Remote*: someone applied a
   migration that isn't in this repository.

4. **One-time sync for migrations applied in the SQL Editor.** Earlier
   migrations were run by hand, so the remote history may be empty and the CLI
   would try to run them all again. Mark **only the ones you know are live** as
   applied. Check in the Dashboard that their tables, functions or rows exist:

   ```sh
   npx supabase migration repair --remote --status applied 202609140001 202610080001 202610090001
   ```

   List more versions the same way. This only writes to the history table; it
   runs no SQL. Repeat step 3 until only the genuinely new files are *Local*
   only.

5. **Dry run.** This shows exactly which files would run, without changing
   anything:

   ```sh
   npx supabase db push --remote --dry-run
   ```

6. **Apply.**

   ```sh
   npx supabase db push --remote
   ```

   Then run `npx supabase migration list --remote` again to confirm, and only then merge
   or push the code that depends on the change.

### Without the CLI

You can paste a single new file into Dashboard → SQL Editor and run it. If you
do, record it right away with
`npx supabase migration repair --remote --status applied <version>`. Otherwise the next
`db push --remote` will try to run it a second time.

### New project

`supabase/schema.sql` is not in the migrations folder. On a fresh project, run
it first in the SQL Editor, then `npx supabase db push --remote` to apply every
migration in order. Some migrations have extra rollout steps; see the
[accounts guide](supabase/ACCOUNTS.md) and the
[privacy rollout guide](supabase/PRIVACY-ROLLOUT.md).

## How passwords are stored

Authentication is handled entirely by Supabase Auth. Passwords are hashed with
bcrypt before storage — they are never saved or transmitted in plain text, and
they never touch this app's database tables.

## Adding a new utility

1. Create a folder under `src/utilities/<your-utility>/` with a React component.
2. Register it in [src/utilities/index.ts](src/utilities/index.ts):

   ```ts
   registerUtility({
     id: 'my-utility',          // stable id — config storage key
     name: 'My Utility',
     description: 'What it does.',
     icon: '⚙️',
     component: MyUtility,
   })
   ```

That's it — routing (`/tools/my-utility`), the sidebar entry and the home-page
card are generated from the registry.

### Saving user config

Inside your component, use the `useUtilityConfig` hook with your utility id and
default values. Updates are debounced and upserted to the user's account:

```tsx
const { config, setConfig, loading, saving } = useUtilityConfig('my-utility', {
  favoriteFormat: 'json',
})

// later:
setConfig({ favoriteFormat: 'yaml' })
```

See [src/utilities/text-case/TextCaseConverter.tsx](src/utilities/text-case/TextCaseConverter.tsx)
for a complete example.

### Wishlist

The Wishlist MVP adds private collections, URL products with editable automatic
Amazon/bol details, tags/sorting, revocable share links and anonymous gift
reservations. Apply the new Wishlist SQL migration and **deploy the backend**
with its Supabase Auth configuration before deploying the frontend. See the
[Wishlist setup, privacy model and tests](src/utilities/wishlist/README.md).

### Star Map

Renders a sky poster for any place and moment entirely in the browser (canvas)
and exports it as PDF (via `jspdf`) or PNG. Star, constellation and star-name
data come from [d3-celestial](https://github.com/ofrohn/d3-celestial)
(BSD-3-Clause), compacted into `src/utilities/star-map/sky-data.json` by
`node scripts/build-star-data.mjs`. Planets, the Moon and the Milky Way are
computed in `astro.ts`. Place search uses the Open-Meteo geocoding API, which
also returns the place's time zone. Apply `202611270001_star_map.sql` so
logged-in users can save their settings.

## Account access and saved-data limits

See [the account rollout guide](supabase/ACCOUNTS.md) before enabling Supabase
signup. It includes the owner bootstrap, migration/deployment order, free/pro
app settings, individual overrides, and database-enforced saved-data quotas.

## Privacy, Terms, export, and account deletion

Public pages are `/#/privacy` and `/#/terms`. Accounts are 18+ and require an
explicit acknowledgement. Account privacy controls offer JSON export and
password-confirmed erasure, including for suspended users. Apply the **new**
privacy migration and follow [the privacy rollout guide](supabase/PRIVACY-ROLLOUT.md).
Provider region, retention, processor/transfer arrangements, and applicable legal
requirements need operator verification before claiming GDPR/worldwide compliance.
