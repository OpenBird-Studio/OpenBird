import { readBody } from "../lib/http.js";
import {
  createSession,
  getSession,
  startAgent,
  continueAgent,
  stopAgent,
  subscribe,
} from "../lib/agent.js";

export async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  // parts: ['api', 'agent', ...]

  // POST /api/agent/start
  if (req.method === "POST" && parts.length === 3 && parts[2] === "start") {
    return handleStart(req, res);
  }

  // GET /api/agent/:id/events
  if (req.method === "GET" && parts.length === 4 && parts[3] === "events") {
    return handleEvents(req, res, parts[2]);
  }

  // POST /api/agent/:id/stop
  if (req.method === "POST" && parts.length === 4 && parts[3] === "stop") {
    return handleStop(req, res, parts[2]);
  }

  // GET /api/agent/:id/status
  if (req.method === "GET" && parts.length === 4 && parts[3] === "status") {
    return handleStatus(req, res, parts[2]);
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

async function handleStart(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  const { model, message, sessionId, history } = body;
  if (!model || !message) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model and message are required" }));
    return;
  }

  // Continue existing session or create new one
  if (sessionId) {
    const existing = getSession(sessionId);
    if (!existing) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sessionId }));

    // Start async — don't await
    continueAgent(sessionId, message);
    return;
  }

  const session = createSession(model, history);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ sessionId: session.id }));

  // Start the agent loop async — don't await
  startAgent(session.id, message);
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

  // Send current status immediately so reconnecting clients know the state
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

  stopAgent(sessionId);

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
      iteration: session.iteration,
      model: session.model,
      messages: session.messages,
    }),
  );
}
