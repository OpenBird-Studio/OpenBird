import { listModels } from "../lib/ollama.js";

export async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const host = url.searchParams.get("host") || undefined;
    const models = await listModels(host);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ models }));
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}
