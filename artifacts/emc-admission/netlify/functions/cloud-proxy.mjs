// Netlify Function: Google Apps Script (GAS) Cloud proxy
// Handles: /api/cloud/status, /api/cloud/restore, /api/cloud/backup

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function isGoogleAuthPage(body, finalUrl) {
  if (finalUrl) {
    const u = finalUrl.toLowerCase();
    if (
      u.includes("accounts.google.com") ||
      u.includes("servicelogin") ||
      u.includes("signin/identifier")
    )
      return true;
  }
  return (
    body.includes("accounts.google.com/signin") ||
    body.includes("accounts.google.com/ServiceLogin") ||
    body.includes("accounts.google.com/o/oauth2") ||
    body.includes('id="identifierId"') ||
    body.includes("Sign in - Google Accounts")
  );
}

async function fetchGAS(url, options, timeoutMs = 30_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, redirect: "follow" });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, finalUrl: res.url };
  } finally {
    clearTimeout(timer);
  }
}

function stripLargeBinaryFields(database) {
  const result = {};
  for (const [store, rows] of Object.entries(database)) {
    if (!Array.isArray(rows)) { result[store] = []; continue; }
    if (store === "operanShifts") {
      result[store] = rows.map(({ pdfBase64: _p, ...rest }) => rest);
    } else if (store === "pendings") {
      result[store] = rows.map(({ fotoBase64: _f, ...rest }) => rest);
    } else if (store === "activityLogs") {
      result[store] = rows.slice(-500);
    } else {
      result[store] = rows;
    }
  }
  return result;
}

function parseGASJson(body) {
  try { return JSON.parse(body); } catch { /* fall through */ }
  const m = body.match(/(\{[\s\S]*\})/);
  if (m) { try { return JSON.parse(m[1]); } catch { /* fall through */ } }
  return null;
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  const path = event.path || "";
  // sub = "status" | "restore" | "backup"
  const sub = path.split("/").filter(Boolean).pop();
  const method = event.httpMethod?.toUpperCase() ?? "GET";
  const targetUrl = event.queryStringParameters?.url;

  if (!targetUrl) return json(400, { error: "Missing required query param: url" });

  // ── GET /api/cloud/status ─────────────────────────────────────────────────
  if (sub === "status") {
    try {
      const result = await fetchGAS(
        `${targetUrl}?action=status`,
        { method: "GET", headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*" } },
        12_000,
      );
      if (isGoogleAuthPage(result.body, result.finalUrl))
        return json(200, { online: false, reason: "auth_required" });
      if (result.status === 200) return json(200, { online: true });
      return json(200, { online: result.status < 500 });
    } catch {
      return json(200, { online: false });
    }
  }

  // ── GET /api/cloud/restore ────────────────────────────────────────────────
  if (sub === "restore" && method === "GET") {
    let baseUrl = targetUrl;
    let apiKey = "IPAW-EMC";
    try {
      const parsed = new URL(targetUrl);
      const qApiKey = parsed.searchParams.get("apiKey");
      if (qApiKey) apiKey = qApiKey;
      parsed.search = "";
      baseUrl = parsed.toString();
    } catch { /* use targetUrl as-is */ }

    try {
      const result = await fetchGAS(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          Accept: "application/json, text/plain, */*",
          "User-Agent": UA,
        },
        body: JSON.stringify({ action: "restore", apiKey }),
      });

      if (isGoogleAuthPage(result.body, result.finalUrl))
        return json(403, { error: "Google Apps Script memerlukan autentikasi." });
      if (!result.ok) return json(502, { error: `GAS merespons HTTP ${result.status}` });

      const data = parseGASJson(result.body);
      if (!data) {
        const preview = result.body.slice(0, 300).replace(/\s+/g, " ").trim();
        return json(502, { error: `Respons dari GAS bukan JSON yang valid. (Pratinjau: ${preview})` });
      }
      if (data.success && data.database !== undefined)
        return json(200, { success: true, data: data.database, metadata: data.metadata });
      return json(200, data);
    } catch (err) {
      const message =
        err?.name === "AbortError"
          ? "Request ke Google Apps Script timeout (>30 detik)"
          : err?.message ?? "Unknown error";
      return json(502, { error: message });
    }
  }

  // ── POST /api/cloud/backup ────────────────────────────────────────────────
  if (sub === "backup" && method === "POST") {
    let payload;
    try { payload = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Body yang dikirim bukan JSON yang valid" }); }

    const { apiKey = "", database = {} } = payload;

    if (!Array.isArray(database.users) || database.users.length === 0) {
      return json(400, { error: "Payload backup tidak memiliki Master User (users). Backup dibatalkan." });
    }

    const stripped = stripLargeBinaryFields(database);
    const UPLOAD_ACTIONS = ["save", "backup", "upload", "store", "write", "simpan"];
    let lastError = "GAS tidak mengenali action upload apapun";

    for (const action of UPLOAD_ACTIONS) {
      try {
        const result = await fetchGAS(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
            "User-Agent": UA,
            Accept: "application/json, text/plain, */*",
          },
          body: JSON.stringify({ action, apiKey, database: stripped }),
        });

        if (isGoogleAuthPage(result.body, result.finalUrl))
          return json(403, { error: "Google Apps Script memerlukan autentikasi." });

        const data = parseGASJson(result.body);
        const errText = data?.error || data?.message || "";
        if (errText.toLowerCase().startsWith("unknown action")) { lastError = errText; continue; }
        if (!result.ok) return json(502, { error: `GAS HTTP ${result.status} dengan action "${action}". ${errText}` });
        if (data && data.success === false)
          return json(502, { error: data.message || data.error || `GAS menolak upload dengan action "${action}"` });

        return json(200, { success: true, action, detail: data });
      } catch (err) {
        lastError = err?.message ?? "Unknown error";
      }
    }

    return json(502, { error: `GAS tidak mengenali action upload apapun (dicoba: ${UPLOAD_ACTIONS.join(", ")}). Error terakhir: ${lastError}` });
  }

  return json(404, { error: `Unknown cloud route: ${sub}` });
};
