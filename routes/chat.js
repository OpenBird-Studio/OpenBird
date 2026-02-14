import * as path from "node:path";
import { spawn } from "node:child_process";
import { readBody } from "../lib/http.js";

const BIRD = path.resolve(import.meta.dirname, "..", "bin", "bird.js");

export async function handler(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  const { model, prompt } = body;
  if (!model || !prompt) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model and prompt are required" }));
    return;
  }

  const args = [BIRD, "-m", model, prompt];

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const proc = spawn("node", args);

  proc.stdout.on("data", (data) => {
    res.write(`data: ${JSON.stringify({ content: data.toString() })}\n\n`);
  });

  proc.stderr.on("data", (data) => {
    res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`);
  });

  proc.on("close", () => {
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  });

  req.on("close", () => proc.kill());
}
