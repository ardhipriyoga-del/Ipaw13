// Netlify Function: TrakCare proxy
// Handles: /api/trakcare/patients, /api/trakcare/discharge, /api/trakcare/igd-patients

// ── HTML parsing helpers ──────────────────────────────────────────────────────

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}

function splitByBr(html) {
  return html
    .replace(/<br\s*\/?>/gi, "|")
    .split("|")
    .map((s) => stripTags(s).trim())
    .filter(Boolean);
}

function parseWardRoom(text) {
  const parts = text.split(/ PK /);
  if (parts.length >= 3) {
    return {
      ward: parts[0].trim(),
      room: `PK ${parts[1].trim()}`,
      bed: `PK ${parts.slice(2).join(" PK ").trim()}`,
    };
  } else if (parts.length === 2) {
    return { ward: parts[0].trim(), room: `PK ${parts[1].trim()}`, bed: "" };
  }
  return { ward: text.trim(), room: text.trim(), bed: "" };
}

function parsePatients(html) {
  const patients = [];
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return patients;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1]);
    }
    if (cells.length < 8) continue;

    const wardRoomText = stripTags(cells[0].replace(/<br\s*\/?>/gi, " ")).trim();
    const roomType = stripTags(cells[1]).trim();
    const mrnParts = splitByBr(cells[2]);
    const noRM = mrnParts[0] ?? "";
    const episodeNo = mrnParts[1] ?? "";
    if (!noRM) continue;

    const namaPasien = stripTags(cells[3]).trim();
    const dobParts = splitByBr(cells[4]);
    const dob = dobParts[0] ?? "";
    const sexDesc = dobParts[1] ?? "";
    const payor = stripTags(cells[5]).trim();
    const losMatch = stripTags(cells[6]).match(/(\d+)/);
    const losDays = losMatch ? parseInt(losMatch[1], 10) : 0;
    const admissionDate =
      losDays > 0
        ? new Date(Date.now() - losDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
    const dpjp = stripTags(cells[7]).trim();
    const { ward, room, bed } = parseWardRoom(wardRoomText);

    patients.push({
      noRM, episodeNo, namaPasien, dob, sexDesc, payor, dpjp,
      ward, roomName: room, roomType, bedCode: bed, admissionDate,
    });
  }
  return patients;
}

function parseIGDPatients(html) {
  const patients = [];
  const cardBlocks = html.split('<div class="col-md-3 mb-4">').slice(1);

  for (const block of cardBlocks) {
    if (!block.includes("background-color:lavender")) continue;

    const timerRegex = /<div class="col-6 text-center h1\s*([^"]*)">([\s\S]*?)<\/div>/gi;
    const timers = [];
    let m;
    while ((m = timerRegex.exec(block)) !== null && timers.length < 2) {
      timers.push({ colorClass: m[1].trim(), value: stripTags(m[2]).trim() });
    }
    if (timers.length < 2) continue;

    const timerTransfer = timers[1].value;
    if (!timerTransfer || timerTransfer === "--") continue;

    const infoRegex = /<div class="col-12 font-weight-bold[^"]*">([\s\S]*?)<\/div>/gi;
    const infos = [];
    let im;
    while ((im = infoRegex.exec(block)) !== null) {
      const t = stripTags(im[1]).trim();
      if (t) infos.push(t);
    }
    if (infos.length < 2) continue;

    patients.push({
      nama: infos[0] ?? "",
      noRM: infos[1] ?? "",
      dokter: infos[2] ?? "",
      lokasi: infos[3] ?? "",
      timerOutpatient: timers[0].value,
      timerTransfer,
      timerColor: timers[1].colorClass,
    });
  }
  return patients;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Determine sub-route from path: /api/trakcare/<sub>
  const path = event.path || "";
  const sub = path.split("/").pop(); // "discharge" | "igd-patients" | "patients"

  const targetUrl = event.queryStringParameters?.url;
  const DEFAULT_INPATIENT =
    "https://apps.emc.id/trakcare/dashboard/dailyinpatient/trakcareANLT/hospital/4";
  const DEFAULT_IGD =
    "https://apps.emc.id/trakcare/dashboard/dailyemergencywaitingtime/trakcareANLT/hospital/4";

  const fetchUrl =
    targetUrl ||
    (sub === "igd-patients" ? DEFAULT_IGD : DEFAULT_INPATIENT);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response;
    try {
      response = await fetch(fetchUrl, {
        headers: { Accept: "text/html" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return json(502, { error: `TrakCare responded with HTTP ${response.status}` });
    }

    const html = await response.text();

    if (sub === "igd-patients") {
      const patients = parseIGDPatients(html);
      return json(200, { patients, total: patients.length, fetchedAt: new Date().toISOString() });
    } else {
      // discharge or patients
      const patients = parsePatients(html);
      return json(200, { patients, total: patients.length, fetchedAt: new Date().toISOString() });
    }
  } catch (err) {
    const message =
      err?.name === "AbortError"
        ? "Request ke TrakCare timeout (>15 detik)."
        : err?.message ?? "Unknown error";
    return json(502, { error: message });
  }
};
