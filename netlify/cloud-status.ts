import { fetchGASWithUrl, isGoogleAuthPage, GAS_UA } from "./_cloud-helpers";

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

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12_000);

    try {
      const r = await fetch(`${targetUrl}?action=status`, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "User-Agent": GAS_UA,
          Accept: "application/json, text/plain, */*",
        },
      });
      clearTimeout(timeout);
      const body = await r.text();

      if (isGoogleAuthPage(body, r.url)) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ online: false, reason: "auth_required" }),
        };
      }

      if (r.status === 200) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ online: true }),
        };
      }

      const r2 = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": GAS_UA },
      });
      const body2 = await r2.text();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          online: isGoogleAuthPage(body2, r2.url) ? false : r2.status < 500,
          ...(isGoogleAuthPage(body2, r2.url) ? { reason: "auth_required" } : {}),
        }),
      };
    } catch {
      clearTimeout(timeout);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: false }),
      };
    }
  } catch {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online: false }),
    };
  }
};
