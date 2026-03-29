# Raydium CPMM Sniper Bot — gRPC Sniper Bot for Solana

A **Raydium sniper bot** that uses **gRPC** (Yellowstone) to detect new **CPMM** pools on Raydium and execute buys at pool creation. Built for Solana with a **web UI** (Express). Suitable for **CPMM sniper** workflows.

---

### Repo description (for GitHub/GitLab “About”)

**Short (recommended):**  
Raydium CPMM sniper bot using Yellowstone gRPC for low-latency new-pool detection on Solana. Web UI (Express), cookie sessions. Raydium sniper · CPMM · gRPC sniper.

**Shorter (~120 chars):**  
Raydium CPMM sniper — Yellowstone gRPC new-pool detection, Express web UI, Solana.

**Categories / Topics:**  
`raydium` `sniper-bot` `cpmm` `grpc` `solana` `yellowstone-grpc` `express` `raydium-cpmm` `typescript`

---

## Features

- **gRPC** — Subscribes to Solana via [Yellowstone gRPC](https://github.com/rpcpool/yellowstone-grpc) for low-latency new-pool detection (no polling).
- **Raydium CPMM** — Listens for CPMM `initialize`-style transactions and snipes the new pool’s token (WSOL → mint).
- **Web UI** — Generate a new wallet in-session, **fund it by depositing SOL to its public address**, then enter mint and SOL size and start sniping; balances and status via the API.

---

## Project Architecture

```
Browser  →  Express (static + JSON API + express-session)
                ↓
         sniper/cpmm_new_pool  →  Yellowstone gRPC + Solana RPC
```

| Layer | Path | Role |
|-------|------|------|
| **Entry** | `src/server.ts` | HTTP server, sessions, `/api/*`, serves `public/` |
| **UI** | `public/` | HTML/CSS/JS console |
| **Validation** | `src/web/validation.ts` | Mint / PK / amount checks |
| **Sniper** | `src/sniper/cpmm_new_pool/` | gRPC subscribe → parse pool → wrap → swap |
| **Config** | `src/config/index.ts` | `PORT`, `SESSION_SECRET`, `RPC_ENDPOINT`, `GRPC_ENDPOINT`, `xToken` |

### Sniper flow (CPMM new pool)

1. User generates a wallet in the web UI (secret key shown once, then stored in **server-side session** only). User sends **native SOL** to the generated public address to fund snipes.
2. User submits token mint and SOL amount; server starts `streamRaydiumNewTokens` in the background.
3. **Yellowstone gRPC** streams transactions for the Raydium CPMM program id.
4. Pool info is decoded from `initialize`; after open time, a CPMM swap tx is built and sent via RPC.

---

## Prerequisites

- **Node.js** (v18+)
- **Solana RPC** endpoint (e.g. Helius, QuickNode, public RPC)
- **Yellowstone gRPC** endpoint and `xToken` (e.g. [Triton](https://github.com/rpcpool/yellowstone-grpc) or similar)

---

## How to Run

### 1. Clone and install

```bash
git clone <your-repo-url>
cd gRPC-Raydium-Sniper-Bot
npm install
```

### 2. Environment variables

Create a `.env` in the project root (see `.gitignore`; never commit secrets):

```env
# Server
PORT=3000
SESSION_SECRET=use-a-long-random-string-in-production

# Optional: show “Load sample log lines” in the UI and POST /api/sniper/logs/sample (dev only)
# ENABLE_SAMPLE_SNIPER_LOGS=1

# Solana
RPC_ENDPOINT=https://api.mainnet-beta.solana.com
GRPC_ENDPOINT=your_yellowstone_grpc_endpoint
xToken=your_yellowstone_grpc_x_token
```

Use strong `SESSION_SECRET` and HTTPS in production; treat the machine as trusted for wallet keys held in session.

### 3. Build and start

```bash
npm run build
npm start
```

Open **http://localhost:3000** (or your `PORT`).

Development with reload:

```bash
npm run dev
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run `node dist/server.js` |
| `npm run dev` | Run with nodemon + ts-node |

---

## Author

- **Telegram:** [@microRustyme](https://t.me/microRustyme)

---

## Disclaimer

This is experimental software for educational purposes. Use at your own risk. Sniping involves financial risk and reliance on third-party RPC/gRPC; the author is not responsible for any losses. Always verify contracts and endpoints yourself.

---

## Keywords (for search)

Raydium sniper bot · CPMM sniper · gRPC sniper · Solana sniper · Yellowstone gRPC · Raydium CPMM
