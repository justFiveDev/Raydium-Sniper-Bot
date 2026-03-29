import path from "path";
import express from "express";
import session from "express-session";
import { Keypair } from "@solana/web3.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ENABLE_SAMPLE_SNIPER_LOGS, PORT, SESSION_SECRET } from "./config";
import streamRaydiumNewTokens from "./sniper/cpmm_new_pool";
import { getWalletBalances } from "./sniper/cpmm_new_pool/swap/wrapping";
import {
  isValidAmount,
  isValidPrivateKey,
  isValidTokenAddress,
} from "./web/validation";
import {
  appendSniperLog,
  clearSniperLogs,
  deleteSniperLogs,
  getSniperLogs,
} from "./web/sniperLogBuffer";

declare module "express-session" {
  interface SessionData {
    walletPk?: string;
    sniperRunning?: boolean;
    sniperLastResult?: { status: boolean; msg: string };
    /** Touched when loading dev sample logs so the session cookie is persisted. */
    sampleLogsAt?: number;
  }
}

const app = express();
app.use(express.json({ limit: "32kb" }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));

function walletFromSession(req: express.Request): Keypair | null {
  const pk = req.session.walletPk;
  if (!pk || !isValidPrivateKey(pk)) {
    return null;
  }
  return Keypair.fromSecretKey(bs58.decode(pk));
}

app.get("/api/session", (req, res) => {
  const pk = req.session.walletPk;
  if (!pk || !isValidPrivateKey(pk)) {
    return res.json({ connected: false });
  }
  const pub = Keypair.fromSecretKey(bs58.decode(pk)).publicKey.toBase58();
  void (async () => {
    const wallet = walletFromSession(req);
    let funding: {
      nativeSOL: number;
      wrappedSOL: number;
      totalSOL: number;
    } | null = null;
    if (wallet) {
      const b = await getWalletBalances(wallet);
      funding = {
        nativeSOL: b.nativeSOL,
        wrappedSOL: b.wrappedSOL,
        totalSOL: b.totalSOL,
      };
    }
    res.json({
      connected: true,
      publicKey: pub,
      funding,
      sniperRunning: Boolean(req.session.sniperRunning),
      sniperLastResult: req.session.sniperLastResult ?? null,
    });
  })();
});

app.get("/api/wallet/balance", async (req, res) => {
  const wallet = walletFromSession(req);
  if (!wallet) {
    return res.status(401).json({ error: "No wallet in session" });
  }
  const b = await getWalletBalances(wallet);
  res.json({
    nativeSOL: b.nativeSOL,
    wrappedSOL: b.wrappedSOL,
    totalSOL: b.totalSOL,
  });
});

app.delete("/api/wallet", (req, res) => {
  deleteSniperLogs(req.sessionID);
  req.session.walletPk = undefined;
  req.session.sniperRunning = false;
  req.session.sniperLastResult = undefined;
  res.json({ ok: true });
});

app.post("/api/wallet/generate", (req, res) => {
  const kp = Keypair.generate();
  const privateKey = bs58.encode(kp.secretKey);
  req.session.walletPk = privateKey;
  req.session.sniperRunning = false;
  req.session.sniperLastResult = undefined;
  clearSniperLogs(req.sessionID);
  req.session.save((err) => {
    if (err) {
      console.error("session save after generate:", err);
      return res.status(500).json({ error: "Could not save session" });
    }
    res.json({
      publicKey: kp.publicKey.toBase58(),
      privateKey,
    });
  });
});

app.post("/api/sniper/start", (req, res) => {
  const wallet = walletFromSession(req);
  if (!wallet) {
    return res.status(401).json({ error: "Connect a wallet first" });
  }
  if (req.session.sniperRunning) {
    return res.status(409).json({ error: "A snipe job is already running" });
  }

  const { tokenMint, amountSol } = req.body as {
    tokenMint?: string;
    amountSol?: number;
  };
  if (!tokenMint || typeof tokenMint !== "string" || !isValidTokenAddress(tokenMint.trim())) {
    return res.status(400).json({ error: "Invalid token mint" });
  }
  if (amountSol === undefined || !isValidAmount(amountSol)) {
    return res.status(400).json({ error: "Invalid amount (SOL)" });
  }

  req.session.sniperRunning = true;
  req.session.sniperLastResult = undefined;
  clearSniperLogs(req.sessionID);
  appendSniperLog(req.sessionID, "info", "Snipe job started");

  const sessionId = req.sessionID;
  const uiLog = (
    level: "info" | "warn" | "error",
    message: string
  ): void => {
    appendSniperLog(sessionId, level, message);
  };

  void (async () => {
    try {
      const result = await streamRaydiumNewTokens(
        wallet,
        tokenMint.trim(),
        Number(amountSol),
        uiLog
      );
      req.session.sniperLastResult = result;
    } catch (e) {
      req.session.sniperLastResult = {
        status: false,
        msg: e instanceof Error ? e.message : String(e),
      };
    } finally {
      req.session.sniperRunning = false;
      req.session.save((err) => {
        if (err) {
          console.error("session save after sniper:", err);
        }
      });
    }
  })();

  res.status(202).json({
    ok: true,
    message:
      "Sniping started in the background. Poll GET /api/session for status.",
  });
});

app.get("/api/sniper/logs", (req, res) => {
  res.json({ lines: getSniperLogs(req.sessionID) });
});

app.get("/api/features", (_req, res) => {
  res.json({
    sampleSniperLogs: ENABLE_SAMPLE_SNIPER_LOGS,
  });
});

app.post("/api/sniper/logs/sample", (req, res) => {
  if (!ENABLE_SAMPLE_SNIPER_LOGS) {
    return res.status(404).json({ error: "Sample logs are disabled" });
  }
  const id = req.sessionID;
  clearSniperLogs(id);
  appendSniperLog(id, "info", "[sample] Snipe job started");
  appendSniperLog(id, "info", "[sample] Preparing SOL / WSOL for swap…");
  appendSniperLog(id, "info", "[sample] Streaming started…");
  appendSniperLog(id, "info", "[sample] Listening for new CPMM pools");
  appendSniperLog(id, "warn", "[sample] Waiting for pool open time…");
  appendSniperLog(
    id,
    "info",
    '[sample] Target pool detected: {"token0Mint":"So11111111111111111111111111111111111111112","token1Mint":"DemoMint"}'
  );
  appendSniperLog(
    id,
    "info",
    "[sample] ✅ Success: https://solscan.io/tx/sampleDemoSignature"
  );
  appendSniperLog(id, "error", "[sample] Demo error line (for styling check)");
  req.session.sampleLogsAt = Date.now();
  req.session.save((err) => {
    if (err) {
      console.error("session save after sample logs:", err);
      return res.status(500).json({ error: "Could not save session" });
    }
    res.json({ ok: true, count: 8 });
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Web UI: http://localhost:${PORT}`);
});
