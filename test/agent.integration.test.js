import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const SERVE = path.resolve(import.meta.dirname, "..", "serve.js");
const PORT = 9877;
const BASE = `http://localhost:${PORT}`;

const HOST = process.env.OPENBIRD_TEST_HOST;
const MODEL = process.env.OPENBIRD_TEST_MODEL;
const RUN = process.env.OPENBIRD_RUN_INTEGRATION === "1";

let server;

/** Collect all SSE events from an agent session until status is done/stopped/error. */
function collectEvents(sessionId) {
  return new Promise((resolve, reject) => {
    const events = [];
    const timeout = setTimeout(
      () => reject(new Error("Agent timed out after 60s")),
      60_000,
    );

    fetch(`${BASE}/api/agent/${sessionId}/events`)
      .then((res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        function pump() {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                clearTimeout(timeout);
                resolve(events);
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop();

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const event = JSON.parse(line.slice(6));
                  events.push(event);
                  if (
                    event.type === "status" &&
                    ["done", "stopped", "error", "max_iterations"].includes(
                      event.status,
                    )
                  ) {
                    clearTimeout(timeout);
                    reader.cancel();
                    resolve(events);
                    return;
                  }
                } catch {}
              }
              pump();
            })
            .catch((err) => {
              if (!err.message?.includes("cancel")) {
                clearTimeout(timeout);
                reject(err);
              }
            });
        }
        pump();
      })
      .catch(reject);
  });
}

describe("agent integration — list files", () => {
  before(async () => {
    server = spawn("node", [SERVE], {
      env: { ...process.env, PORT: String(PORT) },
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Server did not start")),
        5000,
      );
      server.stdout.on("data", (d) => {
        if (d.toString().includes("running at")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.stderr.on("data", (d) => {
        clearTimeout(timeout);
        reject(new Error(d.toString()));
      });
    });
  });

  after(() => {
    server?.kill();
  });

  it("spins up a session, lists files, and finds index.html", async (t) => {
    if (!RUN) {
      t.skip("Set OPENBIRD_RUN_INTEGRATION=1 to run agent integration tests");
      return;
    }

    // 1. Start the agent session
    const startRes = await fetch(`${BASE}/api/agent/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        message:
          "List the files in the current directory using ls. Just run ls, nothing else.",
        host: HOST,
      }),
    });

    assert.equal(startRes.status, 200);
    const { sessionId } = await startRes.json();
    assert.ok(sessionId, "should return a sessionId");

    // 2. Collect SSE events until the agent finishes
    const events = await collectEvents(sessionId);

    // 3. Verify we got tool output containing index.html
    const stdoutEvents = events.filter(
      (e) => e.type === "tool_output" && e.stream === "stdout",
    );
    const allOutput = stdoutEvents.map((e) => e.data).join("");

    assert.ok(
      allOutput.includes("index.html"),
      `Expected 'index.html' in ls output but got:\n${allOutput}`,
    );

    // 4. Verify the agent reached done status
    const finalStatus = events.filter((e) => e.type === "status").pop();
    assert.ok(
      finalStatus && ["done", "max_iterations"].includes(finalStatus.status),
      `Expected agent to finish, last status: ${JSON.stringify(finalStatus)}`,
    );
  });
});
