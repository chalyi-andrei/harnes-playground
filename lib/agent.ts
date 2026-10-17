import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "./models";

// Settings
const MAX_STEPS = 10;
const WORKSPACE = path.join(process.cwd(), "workspace");
const SYSTEM_PROMPT =
  "Ты полезный ассистент. Отвечай на языке пользователя. " +
  "Для свежих фактов и новостей используй поиск в интернете. " +
  "Для работы с файлами используй инструменты read_file, write_file, edit_file. " +
  `Сегодня ${new Date().toISOString().slice(0, 10)}.`;

// Tools
const tools: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Прочитать файл из workspace",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Записать файл в workspace",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Заменить фрагмент текста в файле из workspace. old_text должен встречаться в файле ровно один раз.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, old_text: { type: "string" }, new_text: { type: "string" } },
      required: ["path", "old_text", "new_text"],
    },
  },
];

// Web search runs on Anthropic's servers, so runTool doesn't need to handle it.
// Haiku gets the basic version of the tool.
function webSearchTool(model: string): Anthropic.ToolUnion {
  return model.startsWith("claude-haiku")
    ? { type: "web_search_20250305", name: "web_search", max_uses: 5 }
    : { type: "web_search_20260209", name: "web_search", max_uses: 5 };
}

function runTool(name: string, input: any): string {
  // only in workspace
  const file = path.join(WORKSPACE, path.basename(input.path));

  if (name === "read_file") return fs.readFileSync(file, "utf8");
  if (name === "write_file") {
    fs.writeFileSync(file, input.content);
    return "Файл записан";
  }
  if (name === "edit_file") {
    const parts = fs.readFileSync(file, "utf8").split(input.old_text);
    if (parts.length !== 2) throw new Error("old_text должен встречаться в файле ровно один раз");
    fs.writeFileSync(file, parts.join(input.new_text));
    return "Файл отредактирован";
  }
  return "Нет такого инструмента";
}

// Harness agent loop
export async function runAgent(model: string, history: Anthropic.MessageParam[]) {
  if (!MODELS.some((m) => m.id === model)) throw new Error("Неизвестная модель: " + model);

  const client = new Anthropic(); // ANTHROPIC_API_KEY
  const steps: string[] = [];
  const texts: string[] = [];

  // Conversation history. The model remembers nothing, so we send it all every time.
  const messages: Anthropic.MessageParam[] = [...history];

  for (let step = 1; step <= MAX_STEPS; step++) {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: [...tools, webSearchTool(model)],
      messages,
    });
    messages.push({ role: "assistant", content: response.content });

    for (const block of response.content) {
      if (block.type === "text") texts.push(block.text);
      if (block.type === "server_tool_use") steps.push(`Поиск в интернете: ${JSON.stringify(block.input)}`);
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) steps.push(`Источник: ${r.title} — ${r.url}`);
      }
    }

    // Server-side search hit its iteration limit: send everything back and let it continue
    if (response.stop_reason === "pause_turn") continue;

    if (response.stop_reason !== "tool_use") return { reply: texts.join("\n\n"), steps };

    // Run the tools the model asked for
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      steps.push(`Вызов: ${block.name} ${JSON.stringify(block.input)}`);

      let result: string;
      try {
        result = runTool(block.name, block.input);
      } catch (e) {
        result = "Ошибка: " + (e as Error).message;
      }
      steps.push("Результат: " + result);
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }

    // Send the results back to the model and loop again
    messages.push({ role: "user", content: results });
  }

  steps.push("Стоп: достигнут лимит шагов");
  return { reply: texts.join("\n\n"), steps };
}
