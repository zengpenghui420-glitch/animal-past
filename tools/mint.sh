#!/usr/bin/env bash
# Mint limited-use codes into MantleDB (each code: 3 uses).
# Codes live in collection ap/ and look like AP7K3N (prefix AP + 4).
# They are not valid for other quizzes (c/, mb/, bz/, hq/, sc/, …).
# Usage: MANTLE_KEY=... ./tools/mint.sh [count]
# Or: MANTLE_CREDS=/path/to.json ./tools/mint.sh 10
set -euo pipefail
NS="${MANTLE_NS:-catquiz-zph420-codes}"
COL="${MANTLE_COL:-ap}"
PREFIX="${CODE_PREFIX:-AP}"
KEY="${MANTLE_KEY:-}"
COUNT="${1:-10}"
MAX_USES="${MAX_USES:-3}"
if [[ -z "$KEY" && -n "${MANTLE_CREDS:-}" && -f "${MANTLE_CREDS}" ]]; then
  KEY=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['key'])" "$MANTLE_CREDS")
fi
if [[ -z "$KEY" ]]; then
  echo "Set MANTLE_KEY env (write key for namespace $NS)" >&2
  exit 1
fi
if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || [[ "$COUNT" -lt 1 ]]; then
  echo "count must be a positive integer" >&2
  exit 1
fi
ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789'
minted=()
attempts=0
max_attempts=$((COUNT * 30))
while [[ ${#minted[@]} -lt $COUNT ]]; do
  attempts=$((attempts + 1))
  if [[ $attempts -gt $max_attempts ]]; then
    echo "Stopped: too many attempts (${#minted[@]}/$COUNT minted)" >&2
    exit 1
  fi
  code="$PREFIX"
  for _ in 1 2 3 4; do
    code+=${ALPHABET:RANDOM%${#ALPHABET}:1}
  done
  status=$(curl -sS -o /dev/null -w '%{http_code}' \
    "https://mantledb.sh/v2/$NS/$COL/$code" \
    -H "X-Mantle-Key: $KEY" \
    -H "User-Agent: animal-past-mint/1.0" || true)
  if [[ "$status" != "404" ]]; then
    echo "skip $code (http ${status:-000})" >&2
    continue
  fi
  resp=$(curl -sS -X POST "https://mantledb.sh/v2/$NS/$COL/$code" \
    -H "Content-Type: application/json" \
    -H "X-Mantle-Key: $KEY" \
    -H "User-Agent: animal-past-mint/1.0" \
    -d "{\"remaining\":$MAX_USES,\"max\":$MAX_USES,\"created\":\"$(date -Iseconds)\"}")
  echo "$code  $resp"
  minted+=("$code")
done
echo "-----"
echo "Minted ${#minted[@]} codes (each $MAX_USES uses) in $NS/$COL/:"
printf '%s\n' "${minted[@]}"
