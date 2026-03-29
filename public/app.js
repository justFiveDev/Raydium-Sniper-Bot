const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLogs(lines) {
  const el = $("sniper-log-output");
  if (!el) return;
  if (!lines || !lines.length) {
    el.innerHTML = '<div class="log-line log-info"><span class="log-ts"></span>No log lines yet.</div>';
    return;
  }
  el.innerHTML = lines
    .map((l) => {
      const t = new Date(l.ts).toLocaleTimeString();
      const lvl = l.level || "info";
      return `<div class="log-line log-${escapeHtml(lvl)}"><span class="log-ts">[${escapeHtml(t)}]</span>${escapeHtml(l.message)}</div>`;
    })
    .join("");
  el.scrollTop = el.scrollHeight;
}

async function fetchAndRenderLogs() {
  try {
    const data = await api("/api/sniper/logs");
    renderLogs(data.lines);
  } catch {
    /* ignore */
  }
}

function formatFunding(f) {
  if (!f) return "—";
  const n = (x) => (typeof x === "number" ? x.toFixed(4) : "—");
  return `Total ${n(f.totalSOL)} (native ${n(f.nativeSOL)} + wSOL ${n(f.wrappedSOL)})`;
}

function setConnectedLayout(connected, funding, publicKey) {
  $("wallet-intro").classList.toggle("hidden", connected);
  $("wallet-connected").classList.toggle("hidden", !connected);
  $("btn-start").disabled = !connected;
  if (publicKey) {
    $("pubkey-display").textContent = publicKey;
  }
  if (connected) {
    $("balance-display").textContent = formatFunding(funding);
  }
}

async function refreshSession() {
  try {
    const s = await api("/api/session");
    if (!s.connected) {
      setConnectedLayout(false);
      $("generate-secrets").classList.add("hidden");
      $("status-line").textContent = "";
      return;
    }
    setConnectedLayout(true, s.funding, s.publicKey);
    if (s.sniperRunning) {
      $("status-line").textContent = "Sniping in progress…";
      fetchAndRenderLogs();
      pollStatusAndLogs();
    } else if (s.sniperLastResult) {
      $("status-line").textContent = s.sniperLastResult.status
        ? "Last run finished."
        : "Last run finished with an error.";
      $("result-line").textContent = s.sniperLastResult.msg || "";
    } else {
      $("status-line").textContent = "";
    }
  } catch {
    setConnectedLayout(false);
    $("status-line").textContent = "Could not reach server.";
  }
}

async function refreshBalanceOnly() {
  try {
    const b = await api("/api/wallet/balance");
    $("balance-display").textContent = formatFunding(b);
  } catch {
    $("balance-display").textContent = "Could not load balance";
  }
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
}

$("btn-generate").addEventListener("click", async () => {
  $("result-line").textContent = "";
  $("status-line").textContent = "";
  try {
    const r = await api("/api/wallet/generate", { method: "POST" });
    $("secret-key-display").textContent = r.privateKey;
    $("deposit-address-display").textContent = r.publicKey;
    $("generate-secrets").classList.remove("hidden");
    setConnectedLayout(true, null, r.publicKey);
    $("balance-display").textContent = "Loading…";
    await refreshSession();
    await fetchAndRenderLogs();
    $("status-line").textContent =
      "Connected. Fund by sending SOL to the deposit address above, then refresh balance.";
  } catch (e) {
    $("status-line").textContent = e.message || "Generate failed.";
  }
});

$("btn-secrets-done").addEventListener("click", () => {
  $("generate-secrets").classList.add("hidden");
  $("secret-key-display").textContent = "";
});

$("btn-copy-address").addEventListener("click", () => {
  copyText($("deposit-address-display").textContent);
});

$("btn-copy-pubkey").addEventListener("click", () => {
  copyText($("pubkey-display").textContent);
});

$("btn-refresh-balance").addEventListener("click", () => {
  refreshBalanceOnly();
});

$("btn-disconnect").addEventListener("click", async () => {
  try {
    await api("/api/wallet", { method: "DELETE" });
    $("wallet-intro").classList.remove("hidden");
    $("wallet-connected").classList.add("hidden");
    $("generate-secrets").classList.add("hidden");
    $("btn-start").disabled = true;
    $("secret-key-display").textContent = "";
    $("deposit-address-display").textContent = "";
    $("status-line").textContent = "Disconnected.";
    $("result-line").textContent = "";
    renderLogs([]);
  } catch (e) {
    $("status-line").textContent = e.message || "Disconnect failed.";
  }
});

$("btn-start").addEventListener("click", async () => {
  const tokenMint = $("mint-input").value.trim();
  const amountSol = parseFloat($("amount-input").value.trim());
  $("result-line").textContent = "";
  renderLogs([]);
  try {
    await api("/api/sniper/start", {
      method: "POST",
      body: JSON.stringify({ tokenMint, amountSol }),
    });
    $("status-line").textContent =
      "Sniping started — log updates below.";
    await fetchAndRenderLogs();
    pollStatusAndLogs();
  } catch (e) {
    $("status-line").textContent = e.message || "Start failed.";
  }
});

let pollTimer;
function pollStatusAndLogs() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      await fetchAndRenderLogs();
      const s = await api("/api/session");
      if (!s.sniperRunning) {
        clearInterval(pollTimer);
        await fetchAndRenderLogs();
        if (s.connected && s.funding) {
          $("balance-display").textContent = formatFunding(s.funding);
        }
        if (s.sniperLastResult) {
          $("status-line").textContent = s.sniperLastResult.status
            ? "Snipe completed."
            : "Snipe ended without success.";
          $("result-line").textContent = s.sniperLastResult.msg || "";
        }
      }
    } catch {
      clearInterval(pollTimer);
    }
  }, 1000);
}

async function initFeatures() {
  try {
    const f = await api("/api/features");
    if (f.sampleSniperLogs) {
      $("sample-logs-row").classList.remove("hidden");
    }
  } catch {
    /* keep sample row hidden */
  }
}

$("btn-sample-logs").addEventListener("click", async () => {
  $("result-line").textContent = "";
  try {
    await api("/api/sniper/logs/sample", { method: "POST" });
    await fetchAndRenderLogs();
    $("status-line").textContent = "Sample log lines loaded (UI test).";
  } catch (e) {
    $("status-line").textContent =
      e.message || "Sample logs failed (is ENABLE_SAMPLE_SNIPER_LOGS=1 set?)";
  }
});

initFeatures();
refreshSession();
fetchAndRenderLogs();
