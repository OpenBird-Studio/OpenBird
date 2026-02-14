import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const SERVE = path.resolve(import.meta.dirname, "..", "serve.js");
const PORT = 9876;

let server;

/** Parse SSE lines from raw response text into an array of objects. */
function parseSSE(raw) {
  return raw
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));
}

/** POST JSON to a local endpoint and return the full response text. */
async function post(path, body) {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

describe("/api/run", () => {
  before(async () => {
    server = spawn("node", [SERVE], { env: { ...process.env, PORT: String(PORT) } });

    // Wait for the server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server did not start")), 5000);
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
    server.kill();
  });

  it("runs a command and streams stdout", async () => {
    const { status, text } = await post("/api/run", { command: 'echo "hello bird"' });
    assert.equal(status, 200);

    const events = parseSSE(text);
    const stdoutEvents = events.filter((e) => e.type === "stdout");
    const exitEvent = events.find((e) => e.type === "exit");

    assert.ok(stdoutEvents.length > 0, "should have stdout events");
    const output = stdoutEvents.map((e) => e.data).join("");
    assert.ok(output.includes("hello bird"), "stdout should contain echo output");

    assert.ok(exitEvent, "should have an exit event");
    assert.equal(exitEvent.code, 0);
  });

  it("streams stderr on bad command", async () => {
    const { status, text } = await post("/api/run", { command: "ls /no/such/path/ever" });
    assert.equal(status, 200);

    const events = parseSSE(text);
    const stderrEvents = events.filter((e) => e.type === "stderr");
    const exitEvent = events.find((e) => e.type === "exit");

    assert.ok(stderrEvents.length > 0, "should have stderr events");
    assert.ok(exitEvent, "should have an exit event");
    assert.notEqual(exitEvent.code, 0, "exit code should be non-zero");
  });

  it("returns exit code from the process", async () => {
    const { text } = await post("/api/run", { command: "exit 42" });
    const events = parseSSE(text);
    const exitEvent = events.find((e) => e.type === "exit");

    assert.ok(exitEvent);
    assert.equal(exitEvent.code, 42);
  });

  it("returns 400 when command is missing", async () => {
    const { status, text } = await post("/api/run", {});
    assert.equal(status, 400);

    const body = JSON.parse(text);
    assert.equal(body.error, "command is required");
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.error, "Invalid JSON body");
  });

  it("handles multi-line output", async () => {
    const { text } = await post("/api/run", { command: 'printf "line1\\nline2\\nline3"' });
    const events = parseSSE(text);
    const output = events.filter((e) => e.type === "stdout").map((e) => e.data).join("");

    assert.ok(output.includes("line1"));
    assert.ok(output.includes("line2"));
    assert.ok(output.includes("line3"));
  });

  it("sets SSE headers", async () => {
    const { headers } = await post("/api/run", { command: "echo ok" });
    assert.equal(headers.get("content-type"), "text/event-stream");
    assert.equal(headers.get("cache-control"), "no-cache");
  });
});
