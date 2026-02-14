import * as fs from "node:fs";
import * as path from "node:path";

const INDEX_PATH = path.resolve(import.meta.dirname, "..", "index.html");
const CSS_PATH = path.resolve(import.meta.dirname, "..", "style.css");

export function handler(req, res) {
  if (req.url === "/" || req.url === "/index.html") {
    const html = fs.readFileSync(INDEX_PATH, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  if (req.url === "/style.css") {
    const css = fs.readFileSync(CSS_PATH, "utf-8");
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end(css);
    return;
  }
}
