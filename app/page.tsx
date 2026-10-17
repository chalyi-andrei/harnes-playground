"use client";

import { useEffect, useState } from "react";
import ukraine from "@svg-maps/ukraine";

// Map region id -> region name used by the alerts API
const REGIONS: Record<string, string> = {
  cherkasy: "Черкаська область",
  chernihiv: "Чернігівська область",
  chernivtsi: "Чернівецька область",
  crimea: "Севастополь", // the API reports Crimea as Sevastopol
  dnipropetrovsk: "Дніпропетровська область",
  donetsk: "Донецька область",
  "ivano-frankivsk": "Івано-Франківська область",
  kharkiv: "Харківська область",
  kherson: "Херсонська область",
  khmelnytskyi: "Хмельницька область",
  kirovohrad: "Кіровоградська область",
  kyiv: "Київська область",
  "kyiv-city": "м. Київ",
  luhansk: "Луганська область",
  lviv: "Львівська область",
  mykolaiv: "Миколаївська область",
  odessa: "Одеська область",
  poltava: "Полтавська область",
  rivne: "Рівненська область",
  sumy: "Сумська область",
  ternopil: "Тернопільська область",
  vinnytsia: "Вінницька область",
  volyn: "Волинська область",
  zakarpattia: "Закарпатська область",
  zaporizhia: "Запорізька область",
  zhytomyr: "Житомирська область",
};

type Alerts = { cachedat: string; states: Record<string, { alertnow: boolean }> };

export default function MapPage() {
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      fetch("/api/alerts")
        .then((r) => r.json())
        .then((data) => (data.error ? setError(data.error) : (setAlerts(data), setError(""))));
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  const isAlert = (id: string) => alerts?.states[REGIONS[id]]?.alertnow ?? false;
  const active = ukraine.locations.filter((l) => isAlert(l.id));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Карта воздушных тревог</h1>
          <span className="text-sm text-slate-500">
            {alerts ? `Обновлено: ${alerts.cachedat}` : "Загрузка..."}
          </span>
        </div>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        <svg viewBox={ukraine.viewBox} className="h-auto w-full">
          {ukraine.locations.map((l) => (
            <path
              key={l.id}
              d={l.path}
              className={`stroke-white stroke-1 transition-colors hover:opacity-80 ${
                isAlert(l.id) ? "fill-red-500" : "fill-slate-300"
              }`}
            >
              <title>{`${REGIONS[l.id]}: ${isAlert(l.id) ? "тривога" : "спокійно"}`}</title>
            </path>
          ))}
        </svg>

        <div className="mt-3 flex gap-4 text-sm text-slate-600">
          <span className="flex items-center gap-2"><i className="size-3 rounded-sm bg-red-500" /> Тревога</span>
          <span className="flex items-center gap-2"><i className="size-3 rounded-sm bg-slate-300" /> Спокойно</span>
        </div>
      </section>

      <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Тревога сейчас ({active.length})</h2>
        <ul className="space-y-1 text-sm">
          {active.map((l) => (
            <li key={l.id} className="rounded bg-red-50 px-2 py-1 text-red-700">{REGIONS[l.id]}</li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-slate-400">
          Данные: ubilling.net.ua/aerialalerts. Карта: svg-maps (CC BY 4.0).
        </p>
      </aside>
    </div>
  );
}
