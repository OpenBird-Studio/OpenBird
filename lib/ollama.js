const OLLAMA_BASE = process.env.OLLAMA_HOST || "http://localhost:11434";

export async function listModels() {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`);
  if (!res.ok) throw new Error(`Ollama unreachable (${res.status})`);
  const data = await res.json();
  return data.models.map((m) => m.name);
}

/**
 * @param {string} model
 * @param {Array} messages
 * @param {(chunk: string) => void} onChunk - called with text content chunks
 * @returns {Promise<{ response: string, metrics: object|null }>}
 */
export async function chat(model, messages, onChunk) {
  const body = { model, messages, stream: true };

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }

  const decoder = new TextDecoder();
  let fullResponse = "";
  let metrics = null;
  let buffer = "";

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      let json;
      try {
        json = JSON.parse(line);
      } catch {
        continue;
      }
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

  // Process any remaining buffered data
  if (buffer.trim()) {
    try {
      const json = JSON.parse(buffer);
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
    } catch {}
  }

  return { response: fullResponse, metrics };
}
