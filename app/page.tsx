"use client";

import { useEffect, useState } from "react";
import { OBLASTS, RAIONS, VIEW_BOX, type AlertsData, type Status } from "../lib/regions";

const FILL: Record<Status, string> = {
  red: "fill-[#b8392f]",
  partial: "fill-[#e2685c]",
  yellow: "fill-[#d4a514]",
  none: "fill-[#3b4150]",
};

const STATUS_NAMES: Record<Status, string> = {
  red: "Тривога",
  partial: "Тривога в частині району",
  yellow: "Загроза (жовтий рівень)",
  none: "Спокійно",
};

// Threat types from alerts.in.ua
const THREAT_NAMES: Record<string, string> = {
  drones: "Шахеди / БпЛА",
  cruise_missiles: "Крилаті ракети",
  ballistic_missiles: "Балістика",
  unspecified_missiles: "Ракети",
  guided_aerial_bombs: "КАБи",
  tactic_aircraft_activity: "Тактична авіація",
  strategic_aircraft_activity: "Стратегічна авіація",
  mig31k_departure: "Зліт МіГ-31К",
  air_defense: "Робота ППО",
  unknown: "Невідома загроза",
};
const MISSILES = ["cruise_missiles", "ballistic_missiles", "unspecified_missiles"];

// Delta wing and missile, nose to the left
const SHAHED = "M-9 0 6-8 4 0 6 8Z";
const MISSILE = "M-9 0-5-2.5h11l3-4v13l-3-4h-11Z";

// Where to draw the icons of a raion or oblast
const ANCHORS = Object.fromEntries([...OBLASTS, ...RAIONS].map((s) => [s.id, s]));

export default function MapPage() {
  const [alerts, setAlerts] = useState<AlertsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      fetch("/api/alerts")
        .then((r) => r.json())
        .then((data) => (data.error ? setError(data.error) : (setAlerts(data), setError(""))))
        .catch(() => setError("Немає зв'язку з сервером"));
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  const status = (raion: string): Status => alerts?.raions[raion] ?? "none";

  // Sidebar: oblasts with an alert in at least one raion
  const active = OBLASTS.map((o) => {
    const raions = RAIONS.filter((r) => r.oblast === o.id);
    const whole = raions.every((r) => status(r.id) === "red");
    const red = raions.filter((r) => status(r.id) === "red" || status(r.id) === "partial").length;
    const yellow = raions.filter((r) => status(r.id) === "yellow").length;
    const threats = [o.id, ...raions.map((r) => r.id)].flatMap((id) => alerts?.threats[id] ?? []);
    return { o, total: raions.length, whole, red, yellow, threats: [...new Set(threats)] };
  })
    .filter((a) => a.red || a.yellow)
    .sort((a, b) => b.red - a.red || b.yellow - a.yellow);

  const describe = ({ total, whole, red, yellow }: (typeof active)[number]) => {
    if (whole) return "Тривога в усій області";
    if (yellow === total) return "Загроза в усій області";
    return [red && `тривога в ${red} з ${total} р-нів`, yellow && `загроза в ${yellow} з ${total} р-нів`]
      .filter(Boolean)
      .join(", ");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <section className="self-start rounded-xl bg-[#161a22] p-4 text-slate-100 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Карта повітряних тривог</h1>
          <span className="text-sm text-slate-400">
            {alerts ? `Оновлено: ${alerts.updatedAt}` : "Завантаження..."}
          </span>
        </div>
        {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

        <svg viewBox={VIEW_BOX} className="h-auto w-full">
          <defs>
            <symbol id="shahed" viewBox="-10 -10 20 20"><path d={SHAHED} /></symbol>
            <symbol id="missile" viewBox="-10 -10 20 20"><path d={MISSILE} /></symbol>
          </defs>

          {RAIONS.map((r) => (
            <path
              key={r.id}
              d={r.d}
              className={`stroke-black/25 [stroke-width:0.5] transition-colors hover:opacity-80 ${FILL[status(r.id)]}`}
            >
              <title>{`${r.id}: ${STATUS_NAMES[status(r.id)]}`}</title>
            </path>
          ))}

          <g className="pointer-events-none fill-none stroke-[#161a22] [stroke-width:1.5]">
            {OBLASTS.map((o) => <path key={o.id} d={o.d} />)}
          </g>

          <g className="pointer-events-none fill-white text-[11px]" textAnchor="middle">
            {OBLASTS.map((o) => o.label && <text key={o.id} x={o.x} y={o.y}>{o.label}</text>)}
          </g>

          <g className="pointer-events-none fill-white stroke-black/70 [stroke-width:1]">
            {Object.entries(alerts?.threats ?? {}).map(([id, threats]) => {
              const at = ANCHORS[id];
              if (!at) return null;
              return (
                <g key={id}>
                  {threats.includes("drones") && <use href="#shahed" x={at.x - 34} y={at.y + 2} width={32} height={32} />}
                  {threats.some((t) => MISSILES.includes(t)) && (
                    <use href="#missile" x={at.x + 2} y={at.y + 2} width={32} height={32} />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
          {(["red", "partial", "yellow", "none"] as Status[]).map((s) => (
            <span key={s} className="flex items-center gap-2">
              <svg className="size-3"><rect width="12" height="12" rx="2" className={FILL[s]} /></svg>
              {STATUS_NAMES[s]}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <svg viewBox="-10 -10 20 20" className="size-4 fill-white"><path d={SHAHED} /></svg>
            Шахеди
          </span>
          <span className="flex items-center gap-1">
            <svg viewBox="-10 -10 20 20" className="size-4 fill-white"><path d={MISSILE} /></svg>
            Ракети
          </span>
        </div>
      </section>

      <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Тривога зараз ({active.length})</h2>
        <ul className="space-y-1 text-sm">
          {active.map((a) => (
            <li key={a.o.id} className={`rounded px-2 py-1 ${a.red ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
              <div>{a.o.id}</div>
              <div className="text-xs opacity-75">
                {[describe(a), ...a.threats.map((t) => THREAT_NAMES[t] ?? t)].join(" · ")}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-slate-400">
          Дані: {alerts?.source === "alerts.in.ua" ? "alerts.in.ua" : "ubilling.net.ua/aerialalerts"}. Межі:
          ukrainian_geodata (CC BY 4.0). Шахеди показано в районі загрози, а не в точних координатах.
        </p>
      </aside>
    </div>
  );
}
