import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chat, listModels } from "../lib/ollama.js";
import { parseResponse } from "../lib/parser.js";

const OLLAMA_URL = process.env.OLLAMA_HOST || "http://localhost:11434";
const MODEL = process.env.OPENBIRD_TEST_MODEL || "qwen2.5:3b-instruct";
const RUN_INTEGRATION = process.env.OPENBIRD_RUN_INTEGRATION === "1";

describe("ollama integration", () => {
  it("returns a parseable <cmd> response", async (t) => {
    if (!RUN_INTEGRATION) {
      t.skip("Set OPENBIRD_RUN_INTEGRATION=1 to run Ollama integration tests");
      return;
    }

    const models = await listModels();
    if (!models.includes(MODEL)) {
      t.skip(`Model '${MODEL}' not available at ${OLLAMA_URL}`);
      return;
    }

    const messages = [
      {
        role: "system",
        content:
          "When a command is needed, output exactly one command wrapped in <cmd>...</cmd>. No markdown fences. No JSON.",
      },
      {
        role: "user",
        content:
          "Return exactly one shell command that prints openbird-integration-check.",
      },
    ];

    const { response } = await chat(MODEL, messages, () => {});
    const parsed = parseResponse(response);

    assert.ok(parsed.commands.length > 0, `No command parsed from model output: ${response}`);
    assert.match(parsed.commands[0].action, /echo\s+["']?openbird-integration-check["']?/i);
  });
});
