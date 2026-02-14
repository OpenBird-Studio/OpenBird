import { spawn } from "node:child_process";
import { readBody } from "../lib/http.js";

export async function handler(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  const { command } = body;
  if (!command) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "command is required" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const proc = spawn("sh", ["-c", command], { cwd: process.cwd() });

  proc.stdout.on("data", (data) => {
    res.write(`data: ${JSON.stringify({ type: "stdout", data: data.toString() })}\n\n`);
  });

  proc.stderr.on("data", (data) => {
    res.write(`data: ${JSON.stringify({ type: "stderr", data: data.toString() })}\n\n`);
  });

  proc.on("close", (code) => {
    res.write(`data: ${JSON.stringify({ type: "exit", code })}\n\n`);
    res.end();
  });

  req.on("close", () => proc.kill());
}
