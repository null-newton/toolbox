# Accounts, app access, and saved-data limits

Apply `migrations/202610090001_accounts.sql` once, after `schema.sql` and both
Wishlist migrations. It preserves existing data, creates profiles for existing
users, and promotes the existing `isaacsauer@icloud.com` account to master. It
aborts if that existing account cannot be found; use the correct Supabase project.
Signup metadata cannot choose a role or grant access.

Deploy the backend with `SUPABASE_URL` and `SUPABASE_ANON_KEY` set to the same
project as the frontend, then deploy the frontend. Redeploy all edge fallback
functions (cors-proxy, soccer, alphavantage, fmp, morningstar, song-listener) if
these are still deployed, so the old public-key-only endpoints cannot bypass
app restrictions. See the backend README for the fileserver deployment workflow.

After the migration and both deployments, enable **Allow new users to sign up**
in Supabase Dashboard → Authentication → Sign In / Providers
([Supabase signup settings](https://supabase.com/docs/guides/auth/general-configuration)). Keep email confirmation
enabled and configure the production Site URL and allowed redirect URLs.
The existing Register form already calls Supabase Auth signup.

Log in as the owner and choose **Manage accounts** in the sidebar:

- Free starts with no laptop-backend apps, and a 1 MiB saved-data limit per app.
  Browser-only apps stay usable without login. Saving requires an account.
- Pro starts with every registered app enabled and unlimited saved data.
- The master always has full access and unlimited saved data, can assign free/pro
  roles and suspend/reactivate accounts, and cannot demote or suspend itself.
- Default app access and limits can be configured separately for free and pro.
- Select an account to override any app's access and limit, or use defaults again.
  Overrides survive plan changes; reset them when you want the new plan defaults.
- Zero bytes blocks new saves; Unlimited removes the application quota.
  Lowering a limit retains data and permits shrinking/deleting it while blocking
  further growth. Re-enable a disabled app to let its user open it for cleanup.

Supabase RLS gates direct table access. PostgreSQL triggers charge the UTF-8 JSON
size of each saved row, including metadata fields, rather than physical database
or index size. App usage combines utility settings, QR snapshots, and wishlist
collections/items/reservations. Deletes release the charge, including cascades.
Atomic ledger updates serialize saves for a user/app; over-limit transactions
roll back both the data and charge. Existing data is backfilled without truncation.

Backend and edge routes validate user tokens and query current app grants on
requests, so suspension and access revocation apply without waiting for JWT
refresh. Frontend permissions refresh on login, window focus, and every minute.
Anonymous transfer recipients and generated image-result links continue to work;
creating/uploading requires app permission. Subtitle preview/download links use
signed, file-specific two-hour capabilities, invalidated by a backend restart.
Existing shared capabilities are not revoked by suspending the creator.

This adds manually managed pro plans; there is no checkout or billing integration.
Application quotas do not remove Supabase project limits or backend job-size,
retention, concurrency, and resource limits. No service-role key enters the browser
or is needed by the backend access gate.

## Verification

`test/accounts-rls.sql` and `test/wishlist-rls.sql` run inside transactions with
rolled-back fixtures. Run only on a local/test database after all migrations.
The account suite verifies role isolation, app grants, combined per-app quotas,
rollback, deletion/cascade debits, pro defaults, suspension, and overrides.
For concurrent-writer validation on a full PostgreSQL instance, run two sessions
inserting QR records whose combined size exceeds the same free account's cap;
the second transaction must wait for the first and then fail its quota check.
