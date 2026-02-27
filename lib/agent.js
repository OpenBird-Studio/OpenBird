import { chat } from "./ollama.js";
import { parseResponse } from "./parser.js";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "You are Bird, a concise autonomous agent running on a real Linux box. " +
    "You have direct access to execute commands on this system. " +
    "CRITICAL: When the task requires a shell command, output EXACTLY one command wrapped in <cmd>...</cmd>. " +
    "Example: <cmd>ls -la</cmd>. " +
    "Do not use JSON, markdown code fences, or multiple commands. " +
    "Keep the command as a single line. " +
    "Do NOT provide placeholders — every command you return may be executed immediately on this machine. " +
    "Keep explanation minimal — a brief sentence outside the tag is fine. " +
    "If the task is complete, respond with NO <cmd> tag and summarize the result. " +
    "Be specific with real data from command output (e.g. 'Disk usage is at 74% on /dev/sda1'). " +
    "If a command fails, analyze the error and try a different approach.",
};

/** @type {Map<string, AgentSession>} */
const sessions = new Map();

/**
 * Create a new agent session.
 * @param {string} model - Ollama model name
 * @param {Array} [history] - Prior conversation messages to seed context
 * @returns {AgentSession}
 */
export function createSession(model, history, host) {
  const session = {
    id: randomUUID(),
    model,
    host: host || undefined,
    status: "idle",
    messages: Array.isArray(history) ? [...history] : [],
    iteration: 0,
    maxIterations: 20,
    commandFormatRetries: 0,
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
  session.commandFormatRetries = 0;
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

/**
 * Execute a shell command, streaming output via session events.
 * Returns { stdout, stderr, exitCode }.
 */
function runCommand(command, session) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn("sh", ["-c", command], { cwd: process.cwd() });

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      emit(session, { type: "tool_output", tool: "bash", stream: "stdout", data: text });
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      emit(session, { type: "tool_output", tool: "bash", stream: "stderr", data: text });
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on("error", () => {
      resolve({ stdout, stderr, exitCode: 1 });
    });

    if (session.abortController?.signal) {
      session.abortController.signal.addEventListener(
        "abort",
        () => proc.kill(),
        { once: true },
      );
    }
  });
}

async function agentLoop(session) {
  while (
    session.status === "running" &&
    session.iteration < session.maxIterations
  ) {
    if (session.abortController.signal.aborted) {
      throw new DOMException("Agent aborted", "AbortError");
    }

    session.iteration++;
    emit(session, { type: "step_start", iteration: session.iteration });

    // Call AI (no tools — just plain chat)
    const fullMessages = [SYSTEM_PROMPT, ...session.messages];
    const { response, metrics } = await chat(
      session.model,
      fullMessages,
      (chunk) => {
        emit(session, { type: "ai_chunk", content: chunk });
      },
      session.host,
    );

    // Extract command(s) from model output
    const parsed = parseResponse(response);
    const commands = parsed.commands.map((c) => c.action);

    if (commands.length > 0) {
      const command = commands[0];
      const explanation = parsed.info;

      session.messages.push({ role: "assistant", content: response });

      emit(session, {
        type: "ai_done",
        explanation,
        toolCalls: [{
          name: "bash",
          params: { command },
        }],
        metrics,
      });

      if (session.abortController.signal.aborted) {
        throw new DOMException("Agent aborted", "AbortError");
      }

      emit(session, {
        type: "tool_start",
        name: "bash",
        params: { command },
        iteration: session.iteration,
      });

      const result = await runCommand(command, session);

      emit(session, {
        type: "tool_done",
        name: "bash",
        result: { exitCode: result.exitCode },
      });

      // Feed result back as context for next turn
      const parts = [];
      if (result.stdout) parts.push(`stdout:\n${result.stdout.trimEnd()}`);
      if (result.stderr) parts.push(`stderr:\n${result.stderr.trimEnd()}`);
      parts.push(`exit code: ${result.exitCode}`);

      session.messages.push({
        role: "user",
        content: `[Command executed: ${command}]\n${parts.join("\n")}`,
      });
    } else {
      // No command returned. If we haven't executed anything yet, force one strict retry.
      const hasExecutedCommand = session.messages.some(
        (m) => m.role === "user" &&
          typeof m.content === "string" &&
          m.content.startsWith("[Command executed:"),
      );

      session.messages.push({ role: "assistant", content: response });

      emit(session, {
        type: "ai_done",
        explanation: response,
        toolCalls: [],
        metrics,
      });

      if (!hasExecutedCommand && session.commandFormatRetries < 1) {
        session.commandFormatRetries++;
        session.messages.push({
          role: "user",
          content:
            "FORMAT ERROR: You must return exactly one shell command in <cmd>...</cmd> so it can be executed. Return only the next command.",
        });
        continue;
      }

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
