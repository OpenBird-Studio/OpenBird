# OpenBird

We create open AI tools that run on hardware real people can afford, breaking the monopoly on intelligence before it locks in. No one should need a billion-dollar budget to compete. OpenBird isn't just a company, it's a fight to prevent an AI underclass before it's too late.

## System Dependencies

- **Ubuntu** (tested on 22.04+)
- **Node.js** 22+
- **Ollama** — local LLM runtime ([install guide](https://ollama.com/download/linux))

After installing Ollama, pull at least one model:

```sh
ollama pull llama3.2
```

## Usage

```sh
npm install
bird "your prompt"
```

Or start the web UI:

```sh
npm run serve
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Set the `PORT` environment variable to change the default port.
