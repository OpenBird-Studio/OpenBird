# OpenBird

An autonomous AI agent that runs on open models powered by [Ollama](https://ollama.com). Designed for commodity hardware — a single GPU or small cluster is all you need.

OpenBird gives you a web UI where you connect to any Ollama instance (local or remote), pick a model, and let the agent execute shell commands autonomously to accomplish tasks.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Ollama](https://ollama.com) running locally or on a remote machine

### Install

```bash
git clone https://github.com/your-org/openbird.git
cd openbird
npm install
```

### Run

```bash
npm run serve
```

Open `http://localhost:3000`, enter your Ollama URL, and hit **Connect**.

If Ollama is running locally on the default port, leave the URL field empty — it defaults to `http://localhost:11434`.

## Environment Variables

Copy `.env.example` or create a `.env` file. All variables are optional for normal use.

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port for the web UI server | `3000` |
| `OPENBIRD_TEST_MODEL` | Ollama model used by integration tests | `qwen2.5:3b-instruct` |
| `OPENBIRD_TEST_HOST` | Ollama URL used by integration tests | `http://localhost:11434` |
| `OPENBIRD_RUN_INTEGRATION` | Set to `1` to enable integration tests | (disabled) |

Example `.env` for testing against a remote Ollama instance:

```
OPENBIRD_TEST_MODEL=qwen2.5-coder:7b
OPENBIRD_TEST_HOST=https://your-ollama-host:11434
```

## Testing

```bash
# Unit tests
npm test

# Integration tests (requires a running Ollama instance)
OPENBIRD_RUN_INTEGRATION=1 npm run test:integration
```

## Architecture

- **Web UI** — vanilla HTML/JS chat interface, no build step
- **Server** — lightweight Node.js HTTP server (`serve.js`)
- **Agent loop** — sends prompts to Ollama, parses `<cmd>` tags from responses, executes commands, feeds results back until the task is complete
- **Ollama integration** — connects to any Ollama-compatible API endpoint

## License

MIT
