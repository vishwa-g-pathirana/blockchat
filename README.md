# BlockChat

Anonymous, blockchain-style chat. Each browser is a **node** with a local ed25519 identity (no signup) and a full replica of the public chain in IndexedDB. Public messages are blocks broadcast by a thin **bootstrap node**; private 1-to-1 chat (coming next) is off-chain, E2E, device-local.

## Stack
- **Shared:** TypeScript types + pure crypto helpers (`shared/`)
- **Bootstrap node:** Node + TypeScript, Socket.IO, better-sqlite3, custom `Blockchain` (`server/`)
- **Client:** Vite + React + TS, Zustand, Dexie (IndexedDB replica), tweetnacl (identity + block signing), socket.io-client (`client/`)
- Hacker-desktop theme, JetBrains Mono, glassmorphism (ported from the mockup)

## Run (prototype = end-to-end public chat)
```bash
npm install          # installs all workspaces (builds better-sqlite3)
npm run dev          # starts bootstrap node :3001 + client :5173
```
Open http://localhost:5173, click **INITIALIZE NODE**, type a message — it's signed by your node key, appended as a block by the bootstrap node, and broadcast to every connected tab. Open a second tab to see real propagation.

## Deploy (free)

Host it on [Render](https://render.com) (backend + frontend) in a few clicks — see
**[DEPLOY.md](DEPLOY.md)**. The repo includes a [`render.yaml`](render.yaml) blueprint.

## Milestone status
- [x] End-to-end **public chain** chat (signed blocks, live broadcast, IndexedDB replica)
- [x] Live **network dashboard** + **block explorer** (real data)
- [x] **Private 1-to-1 chat** over WebRTC — off-chain, E2E (`ed2curve` + `nacl.box`)
- [x] Polish: proof-of-work **mining animation**, **reconnect** handling, heartbeat live-status
- [x] **Mobile-responsive** layout (bottom tab bar)
- [ ] Persist the chain in production; optional TURN server for restrictive NATs
