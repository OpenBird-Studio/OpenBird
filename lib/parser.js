/**
 * Parse an LLM response into explanation text and extracted commands.
 *
 * Supports three formats (checked in order):
 *   1. <cmd>...</cmd> tags (preferred)
 *   2. CMD: <command> control lines
 *   3. Markdown ```bash fenced code blocks (fallback)
 *
 * @param {string} text - Raw LLM response text
 * @returns {{ info: string, commands: Array<{ action: string }> }}
 */
export function parseResponse(text) {
  const commands = [];
  let info = text;

  // 1. <cmd>...</cmd> tags
  let tagHits = 0;
  info = info.replace(/<cmd>\s*([\s\S]*?)\s*<\/cmd>/gi, (full, raw) => {
    const cmd = normalizeCommand(raw);
    if (cmd) commands.push({ action: cmd });
    tagHits++;
    return "";
  });
  if (tagHits > 0 && commands.length > 0) return { info: info.trim(), commands };

  // 2. CMD: control lines
  const keptLines = [];
  let cmdLineHits = 0;
  for (const line of info.split(/\r?\n/)) {
    const m = line.match(/^\s*CMD:\s*(.*)$/i);
    if (m) {
      const cmd = normalizeCommand(m[1]);
      if (cmd) commands.push({ action: cmd });
      cmdLineHits++;
      continue;
    }
    keptLines.push(line);
  }
  info = keptLines.join("\n");
  if (cmdLineHits > 0 && commands.length > 0) return { info: info.trim(), commands };

  // 3. Markdown ```bash blocks (fallback)
  info = text.replace(/```(?:bash|sh|shell)[ \t]*\n([\s\S]*?)```/gi, (_, code) => {
    const cmd = normalizeCommand(code);
    if (cmd) commands.push({ action: cmd });
    return "";
  }).trim();

  return { info, commands };
}

/**
 * Extract just the command strings from an LLM response.
 * Convenience wrapper around parseResponse for the agent loop.
 *
 * @param {string} text - Raw LLM response text
 * @returns {string[]} Array of command strings
 */
export function extractCommands(text) {
  return parseResponse(text).commands.map((c) => c.action);
}

function normalizeCommand(raw) {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";

  s = s.replace(/^`+|`+$/g, "").trim();
  const lines = s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  return lines[0].replace(/^\$\s+/, "").trim();
}
