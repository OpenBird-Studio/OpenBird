const DEFAULT_HOST = "http://localhost:11434";

export async function listModels(host) {
  const base = host || DEFAULT_HOST;
  const res = await fetch(`${base}/api/tags`);
  if (!res.ok) throw new Error(`Ollama unreachable (${res.status})`);
  const data = await res.json();
  return data.models.map((m) => m.name);
}

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
