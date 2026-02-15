import { chat } from "../lib/ollama.js";
import { readBody } from "../lib/http.js";

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "You are Bird, a concise and helpful assistant. " +
    "When you suggest a shell command the user should run, put it in a fenced code block tagged with `bash` — one command per block, never combine commands with && or ;. " +
    "The user's interface makes each bash code block individually runnable, so splitting them is essential. " +
    "Use other language tags (python, javascript, etc.) for non-runnable code examples. " +
    "Keep all explanation outside the code blocks.",
};

export async function handler(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  const { model, messages } = body;
  if (!model || !Array.isArray(messages) || messages.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model and messages are required" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    const fullMessages = [SYSTEM_PROMPT, ...messages];
    const { metrics } = await chat(model, fullMessages, (chunk) => {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ done: true, metrics })}\n\n`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }

  res.end();
  req.on("close", () => res.end());
}
