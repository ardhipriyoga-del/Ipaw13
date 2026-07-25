// Shared helpers for cloud-* Netlify Functions.

export async function fetchGASWithUrl(
  url: string,
  options: RequestInit,
): Promise<{ ok: boolean; status: number; body: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, redirect: "follow" });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, finalUrl: res.url };
  } finally {
    clearTimeout(timeout);
  }
}

export function isGoogleAuthPage(body: string, finalUrl?: string): boolean {
  if (finalUrl) {
    const u = finalUrl.toLowerCase();
    if (
      u.includes("accounts.google.com") ||
      u.includes("servicelogin") ||
      u.includes("signin/identifier")
    ) return true;
  }
  return (
    body.includes("accounts.google.com/signin") ||
    body.includes("accounts.google.com/ServiceLogin") ||
    body.includes("accounts.google.com/o/oauth2") ||
    body.includes('id="identifierId"') ||
    body.includes("Sign in - Google Accounts")
  );
}

export function stripLargeBinaryFields(
  database: Record<string, any[]>,
): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  for (const [store, rows] of Object.entries(database)) {
    if (!Array.isArray(rows)) { result[store] = []; continue; }
    if (store === "operanShifts") {
      result[store] = rows.map(({ pdfBase64: _pdf, ...rest }: any) => rest);
    } else if (store === "pendings") {
      result[store] = rows.map(({ fotoBase64: _foto, ...rest }: any) => rest);
    } else if (store === "activityLogs") {
      result[store] = rows.slice(-500);
    } else {
      result[store] = rows;
    }
  }
  return result;
}

export const GAS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type NetlifyResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export const JSON_HEADERS = { "Content-Type": "application/json" };
