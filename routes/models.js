import { listModels } from "../lib/ollama.js";

export async function handler(req, res) {
  try {
    const models = await listModels();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ models }));
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}
