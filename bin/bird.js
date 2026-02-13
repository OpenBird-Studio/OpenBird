#!/usr/bin/env node

import * as readline from "node:readline";
import { chat, listModels } from "../lib/ollama.js";

const HELP = `
bird - Talk to your local Ollama LLMs

Usage:
  bird "your prompt"          Send a one-shot prompt
  bird                        Start interactive chat
  bird -m <model> "prompt"    Use a specific model
  bird --models               List available models
  bird --help                 Show this help

Environment:
  OLLAMA_HOST    Ollama base URL (default: http://localhost:11434)
  BIRD_MODEL     Default model (default: llama3.2:latest)
`.trim();

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { model: process.env.BIRD_MODEL || "llama3.2:latest", prompt: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      process.exit(0);
    }
    if (arg === "--models") {
      opts.listModels = true;
      return opts;
    }
    if (arg === "-m" || arg === "--model") {
      opts.model = args[++i];
      if (!opts.model) {
        console.error("Error: -m requires a model name");
        process.exit(1);
      }
      continue;
    }
    // Everything else is the prompt
    opts.prompt = args.slice(i).join(" ");
    break;
  }

  return opts;
}

async function oneShot(model, prompt) {
  const messages = [{ role: "user", content: prompt }];
  process.stdout.write(`\x1b[36m[${model}]\x1b[0m `);
  await chat(model, messages, (chunk) => process.stdout.write(chunk));
  process.stdout.write("\n");
}

async function interactive(model) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const messages = [];
  console.log(`\x1b[36mbird\x1b[0m connected to \x1b[33m${model}\x1b[0m`);
  console.log(`Type your message. Use /quit to exit, /clear to reset, /model <name> to switch.\n`);

  const prompt = () => rl.question("\x1b[32myou>\x1b[0m ", handleLine);

  async function handleLine(line) {
    const input = line.trim();
    if (!input) return prompt();

    if (input === "/quit" || input === "/exit") {
      console.log("Bye!");
      rl.close();
      return;
    }

    if (input === "/clear") {
      messages.length = 0;
      console.log("Chat history cleared.\n");
      return prompt();
    }

    if (input.startsWith("/model")) {
      const newModel = input.split(/\s+/)[1];
      if (newModel) {
        model = newModel;
        console.log(`Switched to \x1b[33m${model}\x1b[0m\n`);
      } else {
        const models = await listModels();
        console.log("Available models:", models.join(", "), "\n");
      }
      return prompt();
    }

    messages.push({ role: "user", content: input });
    process.stdout.write(`\x1b[36mbird>\x1b[0m `);

    try {
      const response = await chat(model, messages, (chunk) =>
        process.stdout.write(chunk)
      );
      process.stdout.write("\n\n");
      messages.push({ role: "assistant", content: response });
    } catch (err) {
      console.error(`\n\x1b[31mError: ${err.message}\x1b[0m\n`);
    }

    prompt();
  }

  prompt();
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.listModels) {
    try {
      const models = await listModels();
      console.log("Available Ollama models:");
      models.forEach((m) => console.log(`  - ${m}`));
    } catch {
      console.error("Error: Could not connect to Ollama. Is it running?");
      process.exit(1);
    }
    return;
  }

  if (opts.prompt) {
    await oneShot(opts.model, opts.prompt);
  } else {
    await interactive(opts.model);
  }
}

main().catch((err) => {
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
});
