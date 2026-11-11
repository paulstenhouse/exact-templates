#!/bin/sh
# Makes an account staff: sets its user.role to "sysadmin" in the local auth database.
# Staff may write the catalogue and stock, read every order and move it on (ship, deliver, cancel).
#
#   sh scripts/make-admin.sh you@example.com            # the hand-run server's database
#   sh scripts/make-admin.sh you@example.com <state>    # another --persist-to directory
#
# Sign up in the app first; then sign in again, so the session carries the new role.
set -e
cd "$(dirname "$0")/.."
email="$1"; state="${2:-.wrangler/dev-state}"
[ -n "$email" ] || { echo "usage: sh scripts/make-admin.sh <email> [<state dir>]" >&2; exit 2; }
case "$email" in *[!A-Za-z0-9@._+-]*) echo "that does not look like an email address: $email" >&2; exit 2;; esac
npx wrangler d1 execute AUTH_DB --local --persist-to "$state" --command "UPDATE user SET role = 'sysadmin' WHERE email = '$email'" >/dev/null
npx wrangler d1 execute AUTH_DB --local --persist-to "$state" --command "SELECT email, role FROM user WHERE email = '$email'"
