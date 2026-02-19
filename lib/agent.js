import { chat } from "./ollama.js";
import { registry } from "./tools/index.js";
import { randomUUID } from "node:crypto";

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "You are Bird, a concise autonomous agent running on a real Linux box. " +
    "You have direct access to tools on this system. " +
    "Use the provided tools to accomplish tasks. " +
    "If the task is complete, respond with NO tool calls and summarize the result. " +
    "Be specific with real data from tool output (e.g. 'Disk usage is at 74% on /dev/sda1'). " +
    "Keep explanations brief — focus on executing the task.",
};

/** @type {Map<string, AgentSession>} */
const sessions = new Map();

/**
 * Create a new agent session.
 * @param {string} model - Ollama model name
 * @param {Array} [history] - Prior conversation messages to seed context
 * @returns {AgentSession}
 */
export function createSession(model, history) {
  const session = {
    id: randomUUID(),
    model,
    status: "idle",
    messages: Array.isArray(history) ? [...history] : [],
    iteration: 0,
    maxIterations: 20,
    listeners: new Set(),
    abortController: null,
  };
  sessions.set(session.id, session);
  return session;
}

/**
 * Get a session by ID.
 * @param {string} id
 * @returns {AgentSession|undefined}
 */
export function getSession(id) {
  return sessions.get(id);
}

/**
 * Start the agent loop for a session.
 * @param {string} sessionId
 * @param {string} userMessage
 */
export async function startAgent(sessionId, userMessage) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  session.status = "running";
  session.abortController = new AbortController();
  session.messages.push({ role: "user", content: userMessage });

  emit(session, { type: "status", status: "running" });

  try {
    await agentLoop(session);
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

/**
 * Continue an existing session with a new user message.
 * @param {string} sessionId
 * @param {string} userMessage
 */
export async function continueAgent(sessionId, userMessage) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  session.iteration = 0;
  await startAgent(sessionId, userMessage);
}

/**
 * Stop a running agent.
 * @param {string} sessionId
 */
export function stopAgent(sessionId) {
  const session = sessions.get(sessionId);
  if (session && session.abortController) {
    session.abortController.abort();
  }
}

/**
 * Subscribe to agent events. Returns an unsubscribe function.
 * @param {string} sessionId
 * @param {(data: string) => void} listener
 * @returns {() => void}
 */
export function subscribe(sessionId, listener) {
  const session = sessions.get(sessionId);
  if (session) session.listeners.add(listener);
  return () => session?.listeners.delete(listener);
}

// --- Internal ---

async function agentLoop(session) {
  const tools = registry.toOllamaTools();

  while (
    session.status === "running" &&
    session.iteration < session.maxIterations
  ) {
    if (session.abortController.signal.aborted) {
      throw new DOMException("Agent aborted", "AbortError");
    }

    session.iteration++;
    emit(session, { type: "step_start", iteration: session.iteration });

    // Step 1: Call AI with tools
    const fullMessages = [SYSTEM_PROMPT, ...session.messages];
    const { response, toolCalls, metrics } = await chat(
      session.model,
      fullMessages,
      (chunk) => {
        emit(session, { type: "ai_chunk", content: chunk });
      },
      { tools },
    );

    // Step 2: Check what the model returned
    // Some models output tool calls as text instead of using native tool_calls.
    // Try to recover those before giving up.
    const effectiveToolCalls = toolCalls?.length
      ? toolCalls
      : extractToolCallsFromText(response);

    if (effectiveToolCalls?.length) {
      // Model wants to call tools — store the assistant message with tool_calls
      session.messages.push({
        role: "assistant",
        content: response || "",
        tool_calls: effectiveToolCalls,
      });

      // Normalize for frontend: [{name, params}]
      const normalizedCalls = effectiveToolCalls.map((tc) => ({
        name: tc.function.name,
        params: tc.function.arguments || {},
      }));

      emit(session, {
        type: "ai_done",
        explanation: "",
        toolCalls: normalizedCalls,
        metrics,
      });

      // Step 3: Execute each tool call
      for (const tc of effectiveToolCalls) {
        if (session.abortController.signal.aborted) {
          throw new DOMException("Agent aborted", "AbortError");
        }

        const name = tc.function.name;
        const args = tc.function.arguments || {};
        const tool = registry.get(name);

        if (!tool) {
          emit(session, { type: "tool_done", name, result: { error: `Unknown tool: ${name}` } });
          session.messages.push({
            role: "tool",
            content: `Error: unknown tool "${name}"`,
          });
          continue;
        }

        emit(session, { type: "tool_start", name, params: args });

        const toolSession = {
          emit: (event) => emit(session, event),
          abortSignal: session.abortController.signal,
        };

        let result;
        try {
          result = await tool.execute(args, toolSession);
        } catch (err) {
          result = { error: err.message };
        }

        emit(session, { type: "tool_done", name, result });

        // Feed result back as role:"tool" message (Ollama format)
        let content;
        if (name === "bash") {
          const parts = [];
          if (result.stdout) parts.push(`stdout:\n${result.stdout.trimEnd()}`);
          if (result.stderr) parts.push(`stderr:\n${result.stderr.trimEnd()}`);
          parts.push(`exit code: ${result.exitCode ?? (result.error ? 1 : 0)}`);
          content = parts.join("\n");
        } else if (result.error) {
          content = `Error: ${result.error}`;
        } else {
          content = JSON.stringify(result);
        }

        session.messages.push({
          role: "tool",
          content,
        });
      }
    } else {
      // No tool calls — model responded with text, task is complete
      session.messages.push({ role: "assistant", content: response });

      emit(session, {
        type: "ai_done",
        explanation: response,
        toolCalls: [],
        metrics,
      });

      session.status = "done";
      emit(session, { type: "status", status: "done" });
      return;
    }
  }

  if (session.iteration >= session.maxIterations) {
    session.status = "done";
    emit(session, { type: "status", status: "max_iterations" });
  }
}

/**
 * Some models output tool calls as plain text JSON instead of using
 * Ollama's native tool_calls. Try to extract them.
 * Returns an array in Ollama tool_calls format, or null.
 */
function extractToolCallsFromText(text) {
  if (!text) return null;
  const calls = [];

  // Match JSON objects on their own lines
  const jsonRegex = /^\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})\s*$/gm;
  let match;
  while ((match = jsonRegex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[1]);
      // {"name": "bash", "arguments": {"command": "ls"}} or {"name": "bash", "params": {...}}
      const name = obj.name || obj.tool;
      const args = obj.arguments || obj.params;
      if (name && typeof name === "string" && args && typeof args === "object") {
        calls.push({ function: { name, arguments: args } });
      }
    } catch {}
  }

  return calls.length ? calls : null;
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
