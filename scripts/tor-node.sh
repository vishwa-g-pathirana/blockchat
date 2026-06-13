#!/usr/bin/env bash
# Launch a project-local Tor instance (which generates a .onion hidden service)
# and run a BlockChat node in Tor mode. Requires `tor` (brew install tor).
# No sudo, no system config — all Tor data stays under ./tor (gitignored).
set -e
cd "$(dirname "$0")/.."

# locate the tor binary (it may not be on PATH)
TOR_BIN="${TOR_BIN:-$(command -v tor || true)}"
if [ -z "$TOR_BIN" ]; then
  for p in /opt/homebrew/bin/tor /usr/local/bin/tor /opt/homebrew/sbin/tor; do
    [ -x "$p" ] && TOR_BIN="$p" && break
  done
fi
[ -z "$TOR_BIN" ] && { echo "✗ tor not found — install it first:  brew install tor"; exit 1; }

mkdir -p tor/data tor/blockchat
chmod 700 tor/data tor/blockchat

echo "🧅 starting Tor ($TOR_BIN) …"
"$TOR_BIN" -f tor/torrc &
TOR_PID=$!
trap 'kill $TOR_PID 2>/dev/null' EXIT

# wait for the hidden-service hostname to appear
for _ in $(seq 1 60); do [ -f tor/blockchat/hostname ] && break; sleep 1; done
ONION="$(cat tor/blockchat/hostname 2>/dev/null)"
[ -z "$ONION" ] && { echo "✗ Tor did not produce a hostname"; exit 1; }

echo ""
echo "🧅  your node's onion address:  $ONION"
echo "    peers connect via:          ws://$ONION:6001"
echo "    browser (Tor Browser):      http://$ONION:7001"
echo ""

TOR_SOCKS="socks5h://127.0.0.1:9050" \
P2P_URL="ws://$ONION:6001" \
NAME="${NAME:-tor-node}" P2P_PORT="${P2P_PORT:-6001}" HTTP_PORT="${HTTP_PORT:-7001}" \
DIFFICULTY="${DIFFICULTY:-15}" PEERS="${PEERS:-}" \
  npm run node
