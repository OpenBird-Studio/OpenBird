import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const INDEX_PATH = path.join(ROOT, "index.html");
const TERMINAL_PATH = path.join(ROOT, "terminal.html");
const CSS_PATH = path.join(ROOT, "style.css");

const STATIC_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function handler(req, res) {
  if (req.url === "/" || req.url === "/index.html") {
    const html = fs.readFileSync(INDEX_PATH, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return true;
  }

  if (req.url === "/terminal" || req.url === "/terminal.html") {
    const html = fs.readFileSync(TERMINAL_PATH, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return true;
  }

  if (req.url === "/style.css") {
    const css = fs.readFileSync(CSS_PATH, "utf-8");
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end(css);
    return true;
  }


  const ext = path.extname(req.url).toLowerCase();
  if (STATIC_TYPES[ext]) {
    const filePath = path.join(ROOT, path.basename(req.url));
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": STATIC_TYPES[ext] });
      res.end(data);
      return true;
    }
  }

  return false;
}
