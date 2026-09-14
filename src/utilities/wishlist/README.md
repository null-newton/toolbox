# Wishlist MVP

Owner route: `#/tools/wishlist` (existing Toolbox account required).
Recipient route: `#/wishlist/<random-uuid>` (works without an account).

Create, rename and delete collections; add/edit/delete HTTPS product links;
fetch basic details from supported Amazon stores and bol; edit any missing or
incorrect fields; assign priority, availability, price/currency and tags. Search
and filter by tag, and sort by priority, price, date, shop or availability.
Price sorting groups currencies instead of implying an exchange rate.
Tracking parameters and common Amazon ASIN URL variants are normalized for
per-collection duplicate detection. Different shop URLs are not matched across
retailers. Product details are snapshots, refreshed explicitly in the editor.

Collections start private. Creating a link enables viewing and reservations for
anyone who possesses it. Links can be replaced or disabled. Collection sharing
includes every item, including items added later; disabling or replacing links
preserves reservations. Deleting an item/collection deletes its reservations.

## Deployment order

1. Apply `supabase/migrations/202609140001_wishlist.sql` once in Supabase SQL
   Editor (also required for new installs after `supabase/schema.sql`).
2. In **toolbox-backend**, configure `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   for the frontend's project. Deploy the backend with its `deploy.sh` on the
   fileserver. This registers `POST /functions/v1/wishlist-metadata`.
3. Deploy the frontend through its existing GitHub Actions workflow.
   `VITE_FUNCTIONS_URL` must point to the self-hosted backend; no metadata Edge
   Function is provided. Manual entry and sharing still work if metadata fails.

No new npm runtime dependencies, service-role secret or disk storage are needed.
Preferences use `utility_configs` through `useUtilityConfig('wishlist', …)`;
collections/items use relational tables because sharing and reservation access
must be enforced independently of private user configuration.

## Privacy and trust boundaries

- Owner tables use RLS; no anonymous table access. The reservation table has
  RLS and no grants to either `anon` or `authenticated`.
- Security-definer RPCs use an empty search path and explicit execution grants,
  following [PostgreSQL function security](https://www.postgresql.org/docs/16/sql-createfunction.html).
  They reveal only the shared collection's item fields and a reserved boolean;
  never owner IDs, cancellation keys or recipient identities.
- Signed-in owners cannot use reservation RPCs on their own collections. An
  owner who signs out and opens their own share link can still act as a guest:
  anonymous sharing cannot distinguish that person from another visitor.
- Recipients keep a random cancellation capability in browser localStorage
  before sending the reservation request. Retries with that same key are
  idempotent; a row lock and unique item primary key prevent double booking.
  Clearing browser data loses cancellation access. No email/name is collected.
- A leaked share link permits viewing and reserving all gifts. Replace or
  disable the link to revoke it. There is no public listing/discovery endpoint.
- Metadata requests verify bearer tokens with Supabase Auth, consistent with
  [Supabase's server-side user verification](https://supabase.com/docs/reference/javascript/auth-getuser).
  Only reviewed HTTPS shop hosts are fetched. DNS addresses are checked and
  pinned; redirects are revalidated. Requests are time/size/concurrency/rate
  bounded. HTML is parsed as data, never rendered or executed, and no remote
  product images are automatically loaded in the browser.

## Validation

- `node --test test/*.test.mjs` — URL normalization, duplicate keys, input/data
  validation, sorting and filtering, plus existing frontend logic tests.
- `npm run build` and `npm run lint`.
- In the backend: `npm test` — includes metadata parsing, authentication,
  allowlist/address restrictions, errors and rate limits.
- On a **local/test** Supabase database after migration:
  `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f test/wishlist-rls.sql`.
  The SQL fixture tests owner/other-user/anonymous access, hidden reservations,
  idempotency, conflict/cancellation, disabled links and cascading deletion;
  all fixtures roll back. Do not run the fixture on production.
- Browser acceptance: two accounts plus a signed-out browser; create two
  collections, import/edit/tag a product, test sorting, open a share link,
  reserve twice from different browsers, cancel from the original browser,
  revoke the link, and confirm that the owner's normal view never shows status.
  Check mobile widths, keyboard navigation, Dutch and English, and unavailable
  metadata. Check real concurrent reservations against staging PostgreSQL.

## Follow-up scope

External wishlist synchronization/mapping, browser share-target registration,
public discovery, selected-item sharing, co-management, drag ordering,
recommendations and price/stock alerts are intentionally outside this MVP.

## Product import troubleshooting

The input takes an individual product URL, not an Amazon `/hz/wishlist/ls/…`
link or bol `/be/nl/verlanglijstje/…` link. Whole-list URLs are detected before
fetching or saving, with instructions to open the list and copy a product link.
External list import remains outside the MVP.

An undeployed/misconfigured backend, expired login, rate limiting and a shop's
access block now have distinct Dutch/English messages. Retailer blocks require
manual entry; the tool does not bypass them. Fetching preserves the submitted
shop URL's language path. Missing price or availability data does not overwrite
manual values. The Amazon parser can read its main product title and buying
price; the bounded HTML download limit is 4 MB. Bol's `cid` and `referrer`
tracking parameters no longer distinguish otherwise identical products.

Deploy both frontend and backend for these fixes; no new SQL migration or
runtime dependency is required.
