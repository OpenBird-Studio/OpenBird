import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../lib/tools/registry.js";

describe("tool registry", () => {
  it("registers and retrieves a tool", () => {
    const reg = createRegistry();
    const tool = { name: "test", description: "A test tool", execute: async () => ({}) };
    reg.register(tool);
    assert.equal(reg.get("test"), tool);
  });

  it("returns undefined for unknown tool", () => {
    const reg = createRegistry();
    assert.equal(reg.get("nope"), undefined);
  });

  it("lists all registered tools", () => {
    const reg = createRegistry();
    reg.register({ name: "a", description: "A", execute: async () => ({}) });
    reg.register({ name: "b", description: "B", execute: async () => ({}) });
    assert.equal(reg.all().length, 2);
    assert.deepEqual(reg.all().map((t) => t.name), ["a", "b"]);
  });

  it("throws if tool has no name", () => {
    const reg = createRegistry();
    assert.throws(() => reg.register({ execute: async () => ({}) }));
  });

  it("throws if tool has no execute", () => {
    const reg = createRegistry();
    assert.throws(() => reg.register({ name: "bad" }));
  });
});

describe("toOllamaTools", () => {
  it("generates correct Ollama tool format", () => {
    const reg = createRegistry();
    reg.register({
      name: "bash",
      description: "Execute a shell command",
      parameters: {
        command: { type: "string", required: true, description: "The command to run" },
      },
      execute: async () => ({}),
    });

    const tools = reg.toOllamaTools();
    assert.equal(tools.length, 1);
    assert.equal(tools[0].type, "function");
    assert.equal(tools[0].function.name, "bash");
    assert.equal(tools[0].function.description, "Execute a shell command");
    assert.deepEqual(tools[0].function.parameters.required, ["command"]);
    assert.equal(tools[0].function.parameters.properties.command.type, "string");
    assert.equal(tools[0].function.parameters.properties.command.description, "The command to run");
  });

  it("handles multiple parameters with optional fields", () => {
    const reg = createRegistry();
    reg.register({
      name: "write_file",
      description: "Write a file",
      parameters: {
        path: { type: "string", required: true, description: "File path" },
        content: { type: "string", required: true, description: "Content" },
        mode: { type: "string", required: false, description: "File mode" },
      },
      execute: async () => ({}),
    });

    const tools = reg.toOllamaTools();
    const fn = tools[0].function;
    assert.deepEqual(fn.parameters.required, ["path", "content"]);
    assert.equal(Object.keys(fn.parameters.properties).length, 3);
  });

  it("handles tools with no parameters", () => {
    const reg = createRegistry();
    reg.register({
      name: "noop",
      description: "Do nothing",
      execute: async () => ({}),
    });

    const tools = reg.toOllamaTools();
    assert.deepEqual(tools[0].function.parameters.properties, {});
    assert.deepEqual(tools[0].function.parameters.required, []);
  });

  it("generates tools for the full built-in registry", async () => {
    const { registry } = await import("../lib/tools/index.js");
    const tools = registry.toOllamaTools();

    assert.equal(tools.length, 3);
    const names = tools.map((t) => t.function.name);
    assert.ok(names.includes("bash"));
    assert.ok(names.includes("read_file"));
    assert.ok(names.includes("write_file"));

    // Every tool has the right shape
    for (const tool of tools) {
      assert.equal(tool.type, "function");
      assert.ok(tool.function.name);
      assert.ok(tool.function.description);
      assert.equal(tool.function.parameters.type, "object");
    }
  });
});
