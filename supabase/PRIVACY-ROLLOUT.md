# Privacy and account-erasure rollout

Implemented for Isaac Sauer (Belgium), contact `isaacsauer+toolbox@icloud.com`.
Accounts are 18+, and Free/Pro are unpaid access levels. The documents are in
English; Dutch interface links identify that language. No worldwide compliance
certification is implied: scope depends on the operator, users, and actual
provider configuration. A qualified Belgian/privacy-law review is appropriate
before representing the service as legally compliant across countries.

## Deploy in this order

1. Apply **only** `migrations/202610090002_privacy.sql` in the existing project's
   SQL Editor. Do not rerun the accounts migration. This adds acceptance receipts,
   user-scoped export/deletion RPCs, and acceptance-aware app access.
2. Deploy the backend changes, then the frontend changes. Existing users must
   acknowledge the current Terms and adulthood before app access. Privacy pages,
   export, deletion, and contact remain available before acknowledgement and
   during suspension. Deploy backend and frontend close together; the acceptance
   gate blocks tool access until the new frontend is available.
3. On the fileserver, the checkout is `/home/isaac/REPOS/toolbox-backend`.
   Run `bash deploy.sh` after the changes have been pushed. No service-role or
   additional Supabase key is needed.
4. Verify `/#/privacy`, `/#/terms`, `/#/account/privacy`, signup, acceptance, export,
   and erasure with a **test account**, never by deleting your real master.
5. For deletion tests, create a QR, wishlist, transfer, and processing job. Confirm
   that the rows/files are gone, share links fail, and unrelated users remain.
   Restart the backend between creation and deletion to test persistent ownership.

The database independently requires a password authentication within five minutes
and the literal `DELETE`; refresh tokens alone do not meet that requirement.
Backend erasure validates that check first, stops the user's active requests and
tracked child processes, removes account-associated files, and then deletes the
Supabase account. A cleanup failure leaves the authentication account in place
and returns an error; some already-cleared files cannot be restored. Retry or
process the request through support. The master can erase itself, which leaves no
master until the operator deliberately provisions one through trusted SQL.

## Provider facts to confirm before claiming compliance

The public notice deliberately marks unknown region/backup/log settings as
unverified. Replace those passages with confirmed facts before final publication:

- **Supabase region:** inspect the project settings/infrastructure in Dashboard.
  Record the actual database region and country. An EU database region alone
  does not prove all provider telemetry/support processing stays in the EU.
- **Backups:** inspect Database → Backups and the project's plan/PITR settings;
  include any manual/off-site backups. Record an actual retention period and a
  process that respects erasure if a backup is restored. Do not promise instant
  deletion from backups.
- **Logs:** check Supabase Auth/audit/log retention, Cloudflare analytics/logging,
  GitHub hosting, and `journald` retention on the backend host. Redact access
  tokens, passwords, upload capabilities, private URLs, and payloads from logs.
  Choose proportionate periods and implement them before putting them in a policy.
- **Processors and transfers:** obtain/review the applicable Supabase and
  Cloudflare DPAs and subprocessors, assess GitHub/other service roles, and verify
  the actual EEA/UK transfer mechanism and any supplementary safeguards. A policy
  mentioning SCCs is not evidence that a transfer arrangement is in place.
- **Operator identification:** if this is a professional/economic service,
  verify Belgian identification requirements (including a geographic address,
  enterprise/VAT information where applicable). No private address was invented
  or published from the workspace.
- **Rights operations:** monitor the contact inbox, verify requesters
  proportionately, answer GDPR requests normally within one month, handle other
  applicable deadlines, maintain a minimal request record, and support requests
  for anonymous reservations or backend files outside the JSON export.
- **Children:** enforce the 18+ policy; if actual knowledge of a child's account
  arises, address it and delete unnecessary data. A checkbox is an attestation,
  not proof of age and not a substitute for all child-privacy obligations.
- **Incidents:** establish a breach assessment/response process, including any
  applicable regulator/user notices. Maintain processor/processing records and
  appropriate access/security controls. Do not use the master for ordinary users.
- **Scope:** assess EU/UK GDPR, Belgian ePrivacy/consumer/e-commerce law, US state
  laws (CCPA is threshold-based; other requirements can have different scopes),
  Canadian/Australian and other laws where relevant. Preserve mandatory rights
  rather than assuming a Belgian-law clause excludes foreign protections.

## Known erasure and retention limits

New transfers persist a private owner UUID; new media jobs persist only a private
owner file for restart-safe cleanup. Owner IDs are not returned to recipients.
Legacy workloads created before this change have no recoverable owner mapping;
remove them by the provided link or normal expiry and audit old orphan directories.
Temporary job registries are in memory, so orphan cleanup after an abnormal stop
must be checked even when ownership metadata now lets a later request find files.
Administrative deletion directly in Supabase, or direct invocation of the
low-level database erasure RPC, does not run backend file cleanup. Use the
backend account endpoint for self-service erasure; when processing requests
manually, also remove the user's backend workloads by owner ID or provided link.
Storage backups, logs, mailed correspondence, other devices, and recipients'
copies require their own lifecycle; database cascades cannot erase them remotely.
Anonymous wishlist cancellation tokens belong to capabilities rather than an
email account. They are excluded from an owner's export and intentionally kept
in browser storage after account deletion, so their holder can still cancel.
The Clear browser preferences action warns before deleting those capabilities.

Export includes saved tool configuration, which may contain user-entered upstream
API credentials. Avoid sending exports to others, and review whether legacy
credential-saving tools should instead use per-session credentials. Auth secrets
and other guests' reservation cancellation capabilities are not exported.

Frontend fonts are self-hosted with OFL licences; there is no Google Fonts request
on initial load. No advertising/analytics SDK was found in the source. This does
not prove that Cloudflare account settings or third-party tools introduce no
tracking. Review browser storage/provider behaviour and get consent before any
non-essential tracker is introduced; do not add a fake cookie banner while
silently loading tracking scripts.

## Sources used for the review

- [EU guidance on GDPR notices, rights, processors and transfers](https://europa.eu/youreurope/business/governance-and-sustainability/digital-and-data-compliance/data-protection-gdpr/index_en.htm)
- [Belgian authority cookie guidance](https://www.dataprotectionauthority.be/professioneel/thema-s/cookies)
- [Belgian authority complaints](https://dataprotectionauthority.be/burger/acties/klacht-indienen)
- [Belgian enterprise website identification requirements](https://economie.fgov.be/nl/themas/online/elektronische-handel/verkoop-internet/bedrijfswebsite-en-accounts-op)
- [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [California privacy-rights and applicability guidance](https://www.oag.ca.gov/privacy/ccpa?version=published)
- [Canada's meaningful-consent guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/)
- [Australian Privacy Principles](https://www.oaic.gov.au/privacy/australian-privacy-principles/read-the-australian-privacy-principles)
- [Supabase residency/transfers FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)
- [Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum)
- [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups)
- [Signed JWT authentication-method claims](https://supabase.com/docs/guides/auth/jwt-fields)
