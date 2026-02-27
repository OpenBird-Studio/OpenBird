import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractCommands, parseResponse } from "../lib/parser.js";

describe("command parser", () => {
  it("extracts command from <cmd> tags", () => {
    const out = parseResponse("Check this first.\n<cmd>ls -la</cmd>");
    assert.deepEqual(out.commands, [{ action: "ls -la" }]);
    assert.equal(out.info, "Check this first.");
  });

  it("extracts command from CMD control line", () => {
    const out = parseResponse("Running now\nCMD: df -h");
    assert.deepEqual(out.commands, [{ action: "df -h" }]);
    assert.equal(out.info, "Running now");
  });

  it("falls back to fenced bash blocks", () => {
    const out = parseResponse("```bash\necho hello\n```");
    assert.deepEqual(out.commands, [{ action: "echo hello" }]);
    assert.equal(out.info, "");
  });

  it("keeps fallback behavior when <cmd> tags are present but empty", () => {
    const out = parseResponse("<cmd>   </cmd>\n```bash\npwd\n```");
    assert.deepEqual(out.commands, [{ action: "pwd" }]);
  });

  it("normalizes multi-line command candidates to the first line", () => {
    assert.deepEqual(extractCommands("<cmd>echo a\necho b</cmd>"), ["echo a"]);
  });
});
