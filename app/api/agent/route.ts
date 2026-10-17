import { runAgent } from "../../../lib/agent";

export async function POST(req: Request) {
  const { model, history } = await req.json();
  try {
    return Response.json(await runAgent(model, history));
  } catch (e) {
    return Response.json({ reply: "Ошибка: " + (e as Error).message, steps: [] });
  }
}
