import { chat } from "../lib/ollama.js";
import { readBody } from "../lib/http.js";

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "You are a concise command-line assistant running on a real Linux box. " +
    "You have direct access to execute commands on this system. " +
    "CRITICAL: When the user's request requires a command, you MUST wrap it in a fenced code block like this:\n" +
    "```bash\ncommand here\n```\n" +
    "NEVER output a bare command without the ```bash wrapper. Every command MUST be inside ```bash ... ```. " +
    "Only return ONE command per response. Never combine commands with && or ;. " +
    "Do NOT provide example commands or placeholders — every command you return will be executed immediately on this machine. " +
    "Keep explanation minimal — a brief sentence before or after the code block is fine. " +
    "If the user's message is purely conversational or informational and needs no command, respond normally with NO code block. " +
    "If asked to continue after a command result, evaluate whether the task is complete. " +
    "If more work is needed, return the next single command in a ```bash block. " +
    "If the task is done, summarize what you found or what was accomplished — answer the user's original question directly using the command output (e.g. 'Yes, Docker is running with 3 active containers' or 'Disk usage is at 74% on /dev/sda1'). Be specific with real data from the output. No code block when done.",
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
