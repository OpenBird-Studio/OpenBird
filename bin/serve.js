#!/usr/bin/env node

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

const PORT = process.env.PORT || 3000;
const BIRD = path.resolve(import.meta.dirname, "bird.js");
const CLIENT_PATH = path.resolve(import.meta.dirname, "..", "client.html");

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

const server = http.createServer(async (req, res) => {
  // Serve the client page
  if (req.method === "GET" && (req.url === "/" || req.url === "/client.html")) {
    const html = fs.readFileSync(CLIENT_PATH, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  // GET /api/models — runs: bird --models
  if (req.method === "GET" && req.url === "/api/models") {
    const proc = spawn("node", [BIRD, "--models"]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) => {
      if (code !== 0) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.trim() || "bird exited with code " + code }));
        return;
      }
      // Parse "  - modelname" lines from bird --models output
      const models = out
        .split("\n")
        .filter((l) => l.startsWith("  - "))
        .map((l) => l.replace("  - ", ""));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models }));
    });
    return;
  }

  // POST /api/chat — runs: bird -m <model> "prompt" and streams stdout
  if (req.method === "POST" && req.url === "/api/chat") {
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
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`openbird web UI running at http://localhost:${PORT}`);
});
