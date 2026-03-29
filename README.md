# Raydium Sniper Bot — CPMM New-Pool Sniper (Solana)

A **Raydium sniper bot** for **Solana** that listens for **new Raydium CPMM pools** over **Yellowstone gRPC**, then submits a **WSOL → token swap** after pool open time. This repo is a **Raydium sniper bot** with a **web dashboard** (Express), **session-based wallet generation**, and **live sniping logs** in the UI.

If you are searching for a **Raydium sniper bot**, **Solana sniper bot**, **CPMM sniper**, or **gRPC sniper bot**, this project targets **Raydium CPMM** pool creation events, not Raydium CLMM or general mempool bots.

---
<img width="762" height="833" alt="Screenshot_1" src="https://github.com/user-attachments/assets/6ed392b0-7659-43f2-a2a4-7267069e6c0c" />



## Topics (GitHub / search)

`raydium-sniper-bot` · `raydium sniper bot` · `solana sniper bot` · `raydium cpmm` · `cpmm sniper` · `yellowstone-grpc` · `grpc sniper` · `solana` · `raydium` · `express` · `typescript`

---

## Features

- **Raydium sniper bot** flow: gRPC stream → decode CPMM `initialize` → wait for `open_time` → build swap → send via RPC.
- **Low-latency detection** using [Yellowstone gRPC](https://github.com/rpcpool/yellowstone-grpc) (e.g. Triton `@triton-one/yellowstone-grpc`).
- **Web UI**: generate a wallet, fund by **SOL deposit** to the public address, set mint + size, start snipe, view **sniping log** lines.
- **Optional dev samples**: set `ENABLE_SAMPLE_SNIPER_LOGS=1` to load demo log lines in the UI.

---

## Project architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Raydium Sniper Bot (this repo)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Browser                                                                 │
│      │                                                                    │
│      ▼                                                                    │
│   ┌──────────────────────┐     ┌─────────────────────────────────────┐  │
│   │  Express (`server`)   │     │  `public/` — HTML / CSS / JS         │  │
│   │  • express-session    │     │  Wallet, snipe form, log panel       │  │
│   │  • REST: /api/*       │     └─────────────────────────────────────┘  │
│   └──────────┬───────────┘                                              │
│              │                                                            │
│              │  starts `streamRaydiumNewTokens` (background job)          │
│              ▼                                                            │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │  `src/sniper/cpmm_new_pool/`                                      │   │
│   │  • Yellowstone client — subscribe txs touching CPMM program id   │   │
│   │  • Parse tx (IDL + shyft parser) → pool mints, state, open_time    │   │
│   │  • `wrapping` — SOL / WSOL prep                                  │   │
│   │  • `cpmm` — Anchor swap ix                                       │   │
│   │  • `ixsExecutor` — versioned tx + CU + retries                     │   │
│   └──────────────┬───────────────────────────────┬───────────────────┘   │
│                  │                               │                        │
│                  ▼                               ▼                        │
│         Yellowstone gRPC                   Solana JSON-RPC                 │
│         (stream transactions)              (send + confirm)               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Main paths

| Area | Path | Role |
|------|------|------|
| HTTP entry | `src/server.ts` | Express app, static files, session, sniper + wallet APIs |
| Config | `src/config/index.ts` | `PORT`, `SESSION_SECRET`, `RPC_ENDPOINT`, `GRPC_ENDPOINT`, `xToken`, flags |
| Sniper core | `src/sniper/cpmm_new_pool/index.ts` | gRPC subscribe loop, pool detection, swap trigger |
| Swap + wrap | `src/sniper/cpmm_new_pool/swap/` | CPMM swap ix, SOL ↔ WSOL setup |
| UI log buffer | `src/web/sniperLogBuffer.ts` | Per-session lines for `/api/sniper/logs` |
| Validation | `src/web/validation.ts` | Mint / amount checks |
| Frontend | `public/` | Single-page console |

---

## Prerequisites

- **Node.js** 25+
- **Solana RPC** URL (mainnet or cluster you intend to use)
- **Yellowstone gRPC** endpoint + **xToken** (from your provider)

---

## How to run this project

### 1. Clone and install dependencies

```bash
git clone https://github.com/justFiveDev/Raydium-Sniper-Bot.git
cd Raydium-Sniper-Bot
yarn
```

### 2. Environment variables

Copy the sample file and edit values:

```bash
cp .env.sample .env
```

Required for real sniping:

- `SESSION_SECRET` — long random string (production: use a strong secret).
- `GRPC_ENDPOINT` — your Yellowstone gRPC URL.
- `xToken` — auth token from the gRPC provider.

Recommended:

- `RPC_ENDPOINT` — reliable Solana HTTP RPC (Helius, QuickNode, etc.).

See **`.env.sample`** for all variables and comments.

### 3. Build TypeScript

```bash
yarn run build
```

This compiles `src/` into `dist/` (see `tsconfig.json`).

### 4. Start the server

```bash
yarn start
```

By default the app listens on **`PORT`** from `.env` (see `.env.sample`; default in code may be **5000**). Open:

`http://localhost:<PORT>`

### 5. Development (auto-restart on file changes)

```bash
yarn run dev
```

Uses **nodemon** + **ts-node** on `src/server.ts` (no separate build step while developing).

### 6. Use the Raydium sniper bot in the browser

1. **Generate wallet & connect** — save the secret key when shown; fund the **public address** with SOL.
2. Enter **token mint** and **SOL amount**, then **Start sniping**.
3. Watch **Sniping log** for stream / wrap / swap messages.

---

## Scripts

| Command | Description |
|---------|-------------|
| `yarn run build` | Compile TypeScript → `dist/` |
| `yarn start` | Run production server: `node dist/server.js` |
| `yarn run dev` | Dev server with reload: `nodemon` + `ts-node` |

---

## Security notes

- Wallet keys live in **server-side sessions**; run behind **HTTPS** in production and lock down the host.
- Use a **dedicated** wallet and only the SOL you are willing to risk.
- Keep **`.env`** out of version control.

---

## Disclaimer

Educational / experimental software. **Raydium sniper bot** trading is high risk. You are responsible for RPC/gRPC providers, keys, and on-chain outcomes. Not financial advice.

---

## Author

- Telegram: [@microRustyme](https://t.me/microRustyme)
