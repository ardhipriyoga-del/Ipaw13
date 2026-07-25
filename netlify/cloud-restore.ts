import {
  fetchGASWithUrl,
  isGoogleAuthPage,
  GAS_UA,
} from "./_cloud-helpers";

export const handler = async (event: {
  queryStringParameters?: Record<string, string> | null;
}) => {
  const targetUrl = event.queryStringParameters?.url;

  if (!targetUrl) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing required query param: url" }),
    };
  }

  let baseUrl = targetUrl;
  let apiKey = "IPAW-EMC";
  try {
    const parsed = new URL(targetUrl);
    const qApiKey = parsed.searchParams.get("apiKey");
    if (qApiKey) apiKey = qApiKey;
    parsed.search = "";
    baseUrl = parsed.toString();
  } catch { /* pakai targetUrl apa adanya */ }

  const postBody = JSON.stringify({ action: "restore", apiKey });

  try {
    const result = await fetchGASWithUrl(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        Accept: "application/json, text/plain, */*",
        "User-Agent": GAS_UA,
      },
      body: postBody,
    });

    if (isGoogleAuthPage(result.body, result.finalUrl)) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            'Google Apps Script memerlukan autentikasi. Pastikan script di-deploy ulang dengan: "Execute as: Me" dan "Who has access: Anyone".',
        }),
      };
    }

    if (!result.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `GAS merespons HTTP ${result.status}` }),
      };
    }

    let json: any;
    try {
      json = JSON.parse(result.body);
    } catch {
      const match = result.body.match(/(\{[\s\S]*\})/);
      if (match) {
        try { json = JSON.parse(match[1]); } catch { /* still failed */ }
      }
      if (!json) {
        const preview = result.body.slice(0, 300).replace(/\s+/g, " ").trim();
        return {
          statusCode: 502,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: `Respons dari GAS bukan JSON yang valid. (Pratinjau: ${preview})`,
          }),
        };
      }
    }

    if (json && json.success && json.database !== undefined) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, data: json.database, metadata: json.metadata }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
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
