#!/usr/bin/env bash
# Apply new Supabase migrations to the linked (production) project.
#
#   ./scripts/db-push.sh          dry run, ask for confirmation, then push
#   ./scripts/db-push.sh --yes    skip the confirmation (dry run still shown)
#
# See "Database migrations" in README.md for the full procedure.
set -euo pipefail

# Always run from the repository root, wherever the script is called from.
cd "$(dirname "$0")/.."

echo "▸ Migrations that would be applied (dry run, nothing changes):"
npx supabase db push --remote --dry-run

if [[ "${1:-}" != "--yes" ]]; then
  echo
  read -r -p "Push these migrations to production? [y/N] " answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo "Cancelled. Nothing was pushed."
    exit 0
  fi
fi

echo
echo "▸ Pushing…"
# --yes: we already asked above, so skip the CLI's own second prompt.
npx supabase db push --remote --yes

echo
echo "▸ Migration history after the push:"
npx supabase migration list --remote
