"use client";

import { useState } from "react";
import { MODELS } from "../../lib/models";

type Message = { role: "user" | "assistant"; content: string; steps?: string[] };

export default function AiPage() {
  const [model, setModel] = useState(MODELS[0].id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const next: Message[] = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    setLoading(true);

    // Only role + text go to the server; steps are just for display
    const history = next.map(({ role, content }) => ({ role, content }));
    const res = await fetch("/api/agent", {
      method: "POST",
      body: JSON.stringify({ model, history }),
    });
    const { reply, steps } = await res.json();

    setMessages([...next, { role: "assistant", content: reply, steps }]);
    setLoading(false);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h1 className="font-semibold">AI-ассистент</h1>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-400">
            Спросите что-нибудь. Агент умеет искать в интернете и работать с файлами в папке workspace.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.steps && m.steps.length > 0 && (
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">Шаги агента ({m.steps.length})</summary>
                  <ul className="mt-1 space-y-1">
                    {m.steps.map((s, j) => <li key={j} className="break-all">{s}</li>)}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}

        {loading && <p className="text-sm text-slate-400">Агент думает...</p>}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ваш вопрос..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
        />
        <button
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Отправить
        </button>
      </form>
    </div>
  );
}
