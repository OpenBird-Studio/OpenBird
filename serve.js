#!/usr/bin/env node

import "dotenv/config";
import * as http from "node:http";
import { handler as staticHandler } from "./routes/static.js";
import { handler as modelsHandler } from "./routes/models.js";
import { handler as chatHandler } from "./routes/chat.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && !req.url.startsWith("/api/")) {
    const handled = staticHandler(req, res);
    if (handled) return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/models")) {
    return modelsHandler(req, res);
  }

  if (req.url.startsWith("/api/chat")) {
    return chatHandler(req, res);
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`openbird web UI running at http://localhost:${PORT}`);
});
