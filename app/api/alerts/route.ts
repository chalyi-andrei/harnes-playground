// Open API, no key needed: https://ubilling.net.ua/aerialalerts/
export async function GET() {
  try {
    const res = await fetch("https://ubilling.net.ua/aerialalerts/", { cache: "no-store" });
    return Response.json(await res.json());
  } catch {
    return Response.json({ error: "Не удалось получить данные о тревогах" }, { status: 502 });
  }
}
