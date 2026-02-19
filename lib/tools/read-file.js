import { readFile } from "node:fs/promises";

export default {
  name: "read_file",
  description: "Read the contents of a file",
  parameters: {
    path: {
      type: "string",
      required: true,
      description: "Absolute or relative file path",
    },
  },
  async execute({ path }) {
    const content = await readFile(path, "utf8");
    return { content, size: content.length };
  },
};
