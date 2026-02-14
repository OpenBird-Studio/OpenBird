const OLLAMA_BASE = process.env.OLLAMA_HOST || "http://localhost:11434";

export async function listModels() {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`);
  if (!res.ok) throw new Error(`Ollama unreachable (${res.status})`);
  const data = await res.json();
  return data.models.map((m) => m.name);
}

export async function chat(model, messages, onChunk) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama error (${res.status}): ${body}`);
  }

  const decoder = new TextDecoder();
  let fullResponse = "";
  let metrics = null;

  for await (const chunk of res.body) {
    const lines = decoder.decode(chunk, { stream: true }).split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      const json = JSON.parse(line);
      if (json.message?.content) {
        fullResponse += json.message.content;
        onChunk(json.message.content);
      }
      if (json.done) {
        metrics = {
          total_duration: json.total_duration,
          load_duration: json.load_duration,
          prompt_eval_count: json.prompt_eval_count,
          prompt_eval_duration: json.prompt_eval_duration,
          eval_count: json.eval_count,
          eval_duration: json.eval_duration,
        };
      }
    }
  }

  return { response: fullResponse, metrics };
}
