import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ollamaChat } from "../routes/chat.js";
import { listModels } from "../routes/models.js";

const HOST = process.env.OPENBIRD_TEST_HOST || "http://localhost:11434";
const MODEL = process.env.OPENBIRD_TEST_MODEL || "qwen2.5:3b-instruct";
const RUN_INTEGRATION = process.env.OPENBIRD_RUN_INTEGRATION === "1";

describe("ollama integration", () => {
  it("streams a chat response", async (t) => {
    if (!RUN_INTEGRATION) {
      t.skip("Set OPENBIRD_RUN_INTEGRATION=1 to run Ollama integration tests");
      return;
    }

    const models = await listModels(HOST);
    if (!models.includes(MODEL)) {
      t.skip(`Model '${MODEL}' not available at ${HOST}`);
      return;
    }

    const messages = [
      { role: "user", content: "Say hello in one sentence." },
    ];

    const chunks = [];
    const { response, metrics } = await ollamaChat(MODEL, messages, (chunk) => {
      chunks.push(chunk);
    }, HOST);

    assert.ok(response.length > 0, "Response should not be empty");
    assert.ok(chunks.length > 0, "Should have received streaming chunks");
    assert.ok(metrics, "Should have received metrics");
  });
});
