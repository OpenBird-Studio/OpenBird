import { createRegistry } from "./registry.js";
import bash from "./bash.js";
import readFile from "./read-file.js";
import writeFile from "./write-file.js";

export const registry = createRegistry();
registry.register(bash);
registry.register(readFile);
registry.register(writeFile);
