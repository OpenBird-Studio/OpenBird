import pty from "node-pty";
import { WebSocketServer } from "ws";

export function attachTerminal(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/api/terminal") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws) => {
    const shell = process.env.SHELL || "bash";
    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || "/",
      env: process.env,
    });

    ptyProcess.onData((data) => {
      try {
        ws.send(JSON.stringify({ type: "output", data }));
      } catch {}
    });

    ptyProcess.onExit(({ exitCode }) => {
      try {
        ws.send(JSON.stringify({ type: "exit", code: exitCode }));
        ws.close();
      } catch {}
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === "input" && typeof msg.data === "string") {
        ptyProcess.write(msg.data);
      } else if (msg.type === "resize" && msg.cols && msg.rows) {
        ptyProcess.resize(Math.max(1, msg.cols), Math.max(1, msg.rows));
      }
    });

    ws.on("close", () => {
      try {
        ptyProcess.kill();
      } catch {}
    });
  });
}
