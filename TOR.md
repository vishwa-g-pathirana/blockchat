# Running a BlockChat node over Tor (onion service)

Routing the P2P network over Tor hides every node's IP address and lets nodes
run behind NAT without port-forwarding. Both ends stay inside Tor — there is no
exit node, so there's nothing to geolocate.

> This makes the **network layer** anonymous. Your on-chain identity is still a
> public key (pseudonymous, not anonymous). See the in-app **Privacy** panel.

## 1 · Install and run Tor

- macOS: `brew install tor`
- Debian/Ubuntu: `sudo apt install tor`

## 2 · Expose your node as an onion service

Edit your `torrc` (macOS Homebrew: `/opt/homebrew/etc/tor/torrc`, Linux:
`/etc/tor/torrc`) and add — pointing the onion port at your node's **P2P** port:

```
HiddenServiceDir /var/lib/tor/blockchat/
HiddenServicePort 6001 127.0.0.1:6001
```

Restart Tor, then read your `.onion` hostname:

```bash
sudo cat /var/lib/tor/blockchat/hostname     # e.g. abcd...xyz.onion
```

Tor also runs a SOCKS proxy on `127.0.0.1:9050` by default — the node uses it to
dial other onions.

## 3 · Start the node in Tor mode

```bash
TOR_SOCKS=socks5h://127.0.0.1:9050 \
P2P_URL=ws://<your-hostname>.onion:6001 \
PEERS=ws://<a-peer>.onion:6001 \
NAME=tor-node P2P_PORT=6001 HTTP_PORT=7001 \
npm run node
```

- `TOR_SOCKS` makes every outbound peer connection go through Tor.
- `P2P_URL` is the address other nodes learn about you by (shared via peer exchange).
- `PEERS` are the `.onion` addresses of nodes you already know.

When it boots you'll see `🧅 Tor:ON` in the log. The whole mesh now runs over Tor.

## 4 · The browser client (full anonymity)

`.onion` addresses only resolve inside Tor, so open the app in **Tor Browser**
and point it at a node's onion HTTP gateway (expose the node's HTTP port the same
way with a second `HiddenServicePort`). The app's **Network Identity** panel will
then show your Tor exit identity instead of your real IP.

## Honest limitations

- **Pseudonymous, not anonymous** — your ed25519 key still links your messages.
- **Private chat is disabled** precisely because its old WebRTC transport leaks
  your real IP even under Tor.
- Tor is strong but not absolute (traffic correlation, fingerprinting, misconfig).
