import {
  fetchGASWithUrl,
  isGoogleAuthPage,
  stripLargeBinaryFields,
  GAS_UA,
} from "./_cloud-helpers";

const UPLOAD_ACTIONS = ["save", "backup", "upload", "store", "write", "simpan"];

export const handler = async (event: {
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
  httpMethod?: string;
}) => {
  const targetUrl = event.queryStringParameters?.url;

  if (!targetUrl) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing required query param: url" }),
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Body yang dikirim bukan JSON yang valid" }),
    };
  }

  const apiKey: string = payload.apiKey ?? "";
  const database: Record<string, any[]> = payload.database ?? {};

  if (!Array.isArray(database.users) || database.users.length === 0) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Payload backup tidak memiliki Master User (users). Backup dibatalkan.",
      }),
    };
  }

  const stripped = stripLargeBinaryFields(database);
  let lastError = "GAS tidak mengenali action upload apapun";
  let successResult: any = null;

  try {
    for (const action of UPLOAD_ACTIONS) {
      const postBody = JSON.stringify({ action, apiKey, database: stripped });

      const result = await fetchGASWithUrl(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "User-Agent": GAS_UA,
          Accept: "application/json, text/plain, */*",
        },
        body: postBody,
      });

      if (isGoogleAuthPage(result.body, result.finalUrl)) {
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error:
              'Google Apps Script memerlukan autentikasi. Pastikan script di-deploy dengan: "Execute as: Me" dan "Who has access: Anyone".',
          }),
        };
      }

      let json: any = null;
      try { json = JSON.parse(result.body); } catch { /* non-JSON */ }

      const errText: string = json?.error || json?.message || "";
      if (errText.toLowerCase().startsWith("unknown action")) {
        lastError = errText;
        continue;
      }

      if (!result.ok) {
        const preview = result.body.slice(0, 300).replace(/\s+/g, " ").trim();
        return {
          statusCode: 502,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: `GAS merespons HTTP ${result.status} dengan action "${action}". ${json?.error || json?.message || preview}`,
          }),
        };
      }

      if (json && json.success === false) {
        return {
          statusCode: 502,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: json.message || json.error || `GAS menolak upload dengan action "${action}"`,
          }),
        };
      }

      successResult = { success: true, action, detail: json };
      break;
    }

    if (!successResult) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `GAS tidak mengenali action upload apapun (dicoba: ${UPLOAD_ACTIONS.join(", ")}). Error terakhir: ${lastError}`,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(successResult),
    };
  } catch (err: any) {
    const message =
      err?.name === "AbortError"
        ? "Request ke Google Apps Script timeout (>30 detik)"
        : err?.message ?? "Unknown error";
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: message }),
    };
  }
};
