import { spawn } from "node:child_process";

export default {
  name: "bash",
  description: "Execute a shell command on the system",
  parameters: {
    command: {
      type: "string",
      required: true,
      description: "The shell command to run",
    },
  },
  async execute({ command }, session) {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const proc = spawn("sh", ["-c", command], { cwd: process.cwd() });

      proc.stdout.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        if (session?.emit) {
          session.emit({ type: "tool_output", tool: "bash", stream: "stdout", data: text });
        }
      });

      proc.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        if (session?.emit) {
          session.emit({ type: "tool_output", tool: "bash", stream: "stderr", data: text });
        }
      });

      proc.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code });
      });

      proc.on("error", () => {
        resolve({ stdout, stderr, exitCode: 1 });
      });

      // Wire up abort — kill the child process
      if (session?.abortSignal) {
        session.abortSignal.addEventListener(
          "abort",
          () => {
            proc.kill();
          },
          { once: true },
        );
      }
    });
  },
};
