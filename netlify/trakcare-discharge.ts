import { parsePatients } from "./_trakcare-parser";

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
    const response = await fetch(targetUrl, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `TrakCare responded with HTTP ${response.status}`,
        }),
      };
    }

    const html = await response.text();
    const patients = parsePatients(html);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patients,
        total: patients.length,
        fetchedAt: new Date().toISOString(),
      }),
    };
  } catch (err: any) {
    const message =
      err?.name === "TimeoutError"
        ? "Request ke TrakCare timeout (>15 detik)."
        : err?.message ?? "Unknown error";
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: message }),
    };
  }
};
