#!/usr/bin/env bash
# Double-click in Finder to apply new Supabase migrations to production.
# macOS opens .command files in Terminal. This one runs db-push.sh, which
# shows a dry run and asks before pushing anything.

cd "$(dirname "$0")"
./db-push.sh
status=$?

echo
if [[ $status -eq 0 ]]; then
  echo "Done."
else
  echo "Something went wrong (exit code $status). Read the messages above."
fi
read -r -p "Press Enter to close this window…" _
