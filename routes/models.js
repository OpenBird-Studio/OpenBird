import * as path from "node:path";
import { spawn } from "node:child_process";

const BIRD = path.resolve(import.meta.dirname, "..", "bin", "bird.js");

export function handler(req, res) {
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
    const models = out
      .split("\n")
      .filter((l) => l.startsWith("  - "))
      .map((l) => l.replace("  - ", ""));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ models }));
  });
}
