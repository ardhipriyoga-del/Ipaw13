// Shared TrakCare HTML parsing logic — used by all trakcare-* Netlify Functions.

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

export function splitByBr(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, "|")
    .split("|")
    .map((s) => stripTags(s).trim())
    .filter(Boolean);
}

export function parseWardRoom(text: string): {
  ward: string;
  room: string;
  bed: string;
} {
  const parts = text.split(/ PK /);
  if (parts.length >= 3) {
    return {
      ward: parts[0].trim(),
      room: `PK ${parts[1].trim()}`,
      bed: `PK ${parts.slice(2).join(" PK ").trim()}`,
    };
  } else if (parts.length === 2) {
    return {
      ward: parts[0].trim(),
      room: `PK ${parts[1].trim()}`,
      bed: "",
    };
  }
  return { ward: text.trim(), room: text.trim(), bed: "" };
}

export interface TrakCarePatient {
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  dob: string;
  sexDesc: string;
  payor: string;
  dpjp: string;
  ward: string;
  roomName: string;
  roomType: string;
  bedCode: string;
  admissionDate: string;
}

export function parsePatients(html: string): TrakCarePatient[] {
  const patients: TrakCarePatient[] = [];

  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return patients;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const rowHTML = rowMatch[1];
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHTML)) !== null) {
      cells.push(cellMatch[1]);
    }

    if (cells.length < 8) continue;

    const wardRoomText = stripTags(
      cells[0].replace(/<br\s*\/?>/gi, " ")
    ).trim();
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
        ? new Date(Date.now() - losDays * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0]
        : new Date().toISOString().split("T")[0];

    const dpjp = stripTags(cells[7]).trim();
    const { ward, room, bed } = parseWardRoom(wardRoomText);

    patients.push({
      noRM,
      episodeNo,
      namaPasien,
      dob,
      sexDesc,
      payor,
      dpjp,
      ward,
      roomName: room,
      roomType,
      bedCode: bed,
      admissionDate,
    });
  }

  return patients;
}

export interface IGDPatient {
  nama: string;
  noRM: string;
  dokter: string;
  lokasi: string;
  timerOutpatient: string;
  timerTransfer: string;
  timerColor: string;
}

export function parseIGDPatients(html: string): IGDPatient[] {
  const patients: IGDPatient[] = [];
  const cardBlocks = html.split('<div class="col-md-3 mb-4">').slice(1);

  for (const block of cardBlocks) {
    if (!block.includes("background-color:lavender")) continue;

    const timerRegex =
      /<div class="col-6 text-center h1\s*([^"]*)">([\s\S]*?)<\/div>/gi;
    const timers: { colorClass: string; value: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = timerRegex.exec(block)) !== null && timers.length < 2) {
      timers.push({ colorClass: m[1].trim(), value: stripTags(m[2]).trim() });
    }
    if (timers.length < 2) continue;

    const timerTransfer = timers[1].value;
    if (!timerTransfer || timerTransfer === "--") continue;

    const infoRegex =
      /<div class="col-12 font-weight-bold[^"]*">([\s\S]*?)<\/div>/gi;
    const infos: string[] = [];
    let im: RegExpExecArray | null;
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
