import { randomUUID } from "node:crypto";

// --- Ollama streaming ---

const DEFAULT_HOST = "http://localhost:11434";

export async function ollamaChat(model, messages, onChunk, host) {
  const base = host || DEFAULT_HOST;
  const body = { model, messages, stream: true };

  const res = await fetch(`${base}/api/chat`, {
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

// --- Session management ---

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "Return you answer in 1 html file with javascript and css. Tailwind is installed.",
};

const sessions = new Map();

function createSession(model, history, host) {
  const session = {
    id: randomUUID(),
    model,
    host: host || undefined,
    status: "idle",
    messages: Array.isArray(history) ? [...history] : [],
    listeners: new Set(),
    abortController: null,
  };
  sessions.set(session.id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id);
}

async function startChat(sessionId, userMessage) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  session.status = "running";
  session.abortController = new AbortController();
  session.messages.push({ role: "user", content: userMessage });

  emit(session, { type: "status", status: "running" });

  try {
    const fullMessages = [SYSTEM_PROMPT, ...session.messages];
    const { response, metrics } = await ollamaChat(
      session.model,
      fullMessages,
      (chunk) => {
        emit(session, { type: "ai_chunk", content: chunk });
      },
      session.host,
    );

    session.messages.push({ role: "assistant", content: response });

    emit(session, { type: "ai_done", metrics });
    session.status = "done";
    emit(session, { type: "status", status: "done" });
  } catch (err) {
    if (err.name === "AbortError" || session.abortController?.signal.aborted) {
      session.status = "stopped";
      emit(session, { type: "status", status: "stopped" });
    } else {
      session.status = "error";
      emit(session, { type: "error", message: err.message });
    }
  }
}

function stopChat(sessionId) {
  const session = sessions.get(sessionId);
  if (session && session.abortController) {
    session.abortController.abort();
  }
}

function subscribe(sessionId, listener) {
  const session = sessions.get(sessionId);
  if (session) session.listeners.add(listener);
  return () => session?.listeners.delete(listener);
}

function emit(session, event) {
  const data = JSON.stringify(event);
  for (const listener of session.listeners) {
    try {
      listener(data);
    } catch {
      session.listeners.delete(listener);
    }
  }
}

// --- HTTP helpers ---

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

// --- Route handler ---

export async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);

  // POST /api/chat/send
  if (req.method === "POST" && parts.length === 3 && parts[2] === "send") {
    return handleSend(req, res);
  }

  // GET /api/chat/:id/events
  if (req.method === "GET" && parts.length === 4 && parts[3] === "events") {
    return handleEvents(req, res, parts[2]);
  }

  // POST /api/chat/:id/stop
  if (req.method === "POST" && parts.length === 4 && parts[3] === "stop") {
    return handleStop(req, res, parts[2]);
  }

  // GET /api/chat/:id/status
  if (req.method === "GET" && parts.length === 4 && parts[3] === "status") {
    return handleStatus(req, res, parts[2]);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

async function handleSend(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  const { model, message, sessionId, history, host } = body;
  if (!model || !message) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model and message are required" }));
    return;
  }

  if (sessionId) {
    const existing = getSession(sessionId);
    if (!existing) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sessionId }));

    startChat(sessionId, message);
    return;
  }

  const session = createSession(model, history, host);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ sessionId: session.id }));

  startChat(session.id, message);
}

function handleEvents(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write(
    `data: ${JSON.stringify({ type: "status", status: session.status })}\n\n`,
  );

  const unsubscribe = subscribe(sessionId, (data) => {
    res.write(`data: ${data}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
  });
}

async function handleStop(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }

  stopChat(sessionId);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

function handleStatus(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      id: session.id,
      status: session.status,
      model: session.model,
      messages: session.messages,
    }),
  );
}
