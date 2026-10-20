import { RAIONS, type AlertsData, type Status } from "../../../lib/regions";

// Two sources:
// - alerts.in.ua: alerts by oblast, raion and hromada, red/yellow levels and threat types (drones, missiles...).
//   Needs a free token: https://alerts.in.ua/api-request -> ALERTS_IN_UA_TOKEN in .env.local
// - ubilling.net.ua: open, no key, but only "alert / no alert" per oblast. Used as a fallback.
// Both rate-limit frequent requests (HTTP 429), so we cache the last good response.
const TTL = 20_000;
let cache: { data: AlertsData; at: number } | null = null;

const RANK: Record<Status, number> = { none: 0, yellow: 1, partial: 2, red: 3 };

// Kam'ianskyi vs Kam’ianskyi
const norm = (name: string) => name.replace(/[’ʼ`]/g, "'");

const RAION_IDS = new Set(RAIONS.map((r) => r.id));
const RAIONS_OF: Record<string, string[]> = {};
for (const r of RAIONS) (RAIONS_OF[r.oblast] ??= []).push(r.id);
// ubilling calls Crimea "Севастополь"
RAIONS_OF["Севастополь"] = [...RAIONS_OF["Автономна Республіка Крим"], ...RAIONS_OF["м. Севастополь"]];

function kyivTime() {
  return new Date().toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" });
}

function emptyData(source: AlertsData["source"], updatedAt: string): AlertsData {
  return { source, updatedAt, raions: Object.fromEntries(RAIONS.map((r) => [r.id, "none"])), threats: {} };
}

function mark(data: AlertsData, raions: string[], status: Status) {
  for (const id of raions) if (RANK[status] > RANK[data.raions[id]]) data.raions[id] = status;
}

type Alert = {
  alert_type: string;
  alert_level?: "red" | "yellow";
  location_title: string;
  location_uid: string;
  location_oblast: string;
  location_oblast_uid: string;
  location_raion?: string;
  threats?: { threat_type: string }[];
};

async function fromAlertsInUa(token: string): Promise<AlertsData> {
  const res = await fetch("https://api.alerts.in.ua/v1/alerts/active.json", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`alerts.in.ua: HTTP ${res.status}`);
  const { alerts } = (await res.json()) as { alerts: Alert[] };

  const data = emptyData("alerts.in.ua", kyivTime());
  for (const a of alerts) {
    if (a.alert_type !== "air_raid") continue;
    const level: Status = a.alert_level === "yellow" ? "yellow" : "red";
    const oblast = norm(a.location_oblast);
    const title = norm(a.location_title);
    const raion = a.location_raion && norm(a.location_raion);

    // The alert covers the whole oblast, one raion, or a hromada/city inside a raion
    let raions: string[];
    let threatsAt: string;
    if (a.location_uid === a.location_oblast_uid && RAIONS_OF[oblast]) {
      raions = RAIONS_OF[oblast];
      threatsAt = oblast;
      mark(data, raions, level);
    } else if (RAION_IDS.has(title)) {
      raions = [title];
      threatsAt = title;
      mark(data, raions, level);
    } else if (raion && RAION_IDS.has(raion)) {
      raions = [raion];
      threatsAt = raion;
      mark(data, raions, level === "red" ? "partial" : level);
    } else {
      console.warn("Unknown alert location:", a.location_title, "/", a.location_oblast);
      continue;
    }

    for (const t of a.threats ?? []) {
      const list = (data.threats[threatsAt] ??= []);
      if (!list.includes(t.threat_type)) list.push(t.threat_type);
    }
  }
  return data;
}

async function fromUbilling(): Promise<AlertsData> {
  const res = await fetch("https://ubilling.net.ua/aerialalerts/", { cache: "no-store" });
  if (!res.ok) throw new Error(`ubilling: HTTP ${res.status}`);
  const json = (await res.json()) as { cachedat: string; states: Record<string, { alertnow: boolean }> };

  const data = emptyData("ubilling", json.cachedat);
  for (const [oblast, state] of Object.entries(json.states)) {
    if (state.alertnow) mark(data, RAIONS_OF[norm(oblast)] ?? [], "red");
  }
  return data;
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return Response.json(cache.data);

  const token = process.env.ALERTS_IN_UA_TOKEN;
  try {
    const data = token ? await fromAlertsInUa(token) : await fromUbilling();
    cache = { data, at: Date.now() };
    return Response.json(data);
  } catch (e) {
    console.error(e);
    // Stale data is better than an empty map
    if (cache) return Response.json(cache.data);
    return Response.json({ error: "Не вдалося отримати дані про тривоги" }, { status: 502 });
  }
}
