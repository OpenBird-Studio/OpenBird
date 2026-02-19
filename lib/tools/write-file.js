import { writeFile } from "node:fs/promises";

export default {
  name: "write_file",
  description: "Write content to a file (creates or overwrites)",
  parameters: {
    path: {
      type: "string",
      required: true,
      description: "Absolute or relative file path",
    },
    content: {
      type: "string",
      required: true,
      description: "The content to write",
    },
  },
  async execute({ path, content }) {
    await writeFile(path, content, "utf8");
    return { written: true, path, bytes: Buffer.byteLength(content) };
  },
};
