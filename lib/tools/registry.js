/**
 * Tool registry — register, lookup, and generate Ollama tool schemas.
 */

export function createRegistry() {
  /** @type {Map<string, ToolDefinition>} */
  const tools = new Map();

  return {
    /**
     * Register a tool definition.
     * @param {ToolDefinition} tool
     */
    register(tool) {
      if (!tool.name || !tool.execute) {
        throw new Error(`Tool must have a name and execute function`);
      }
      tools.set(tool.name, tool);
    },

    /**
     * Get a tool by name.
     * @param {string} name
     * @returns {ToolDefinition|undefined}
     */
    get(name) {
      return tools.get(name);
    },

    /**
     * Get all registered tools.
     * @returns {ToolDefinition[]}
     */
    all() {
      return [...tools.values()];
    },

    /**
     * Generate Ollama-compatible tools array for the API.
     * @returns {Array}
     */
    toOllamaTools() {
      return [...tools.values()].map((tool) => {
        const properties = {};
        const required = [];
        for (const [key, def] of Object.entries(tool.parameters || {})) {
          properties[key] = {
            type: def.type,
            description: def.description || "",
          };
          if (def.enum) properties[key].enum = def.enum;
          if (def.required) required.push(key);
        }
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: {
              type: "object",
              properties,
              required,
            },
          },
        };
      });
    },
  };
}
