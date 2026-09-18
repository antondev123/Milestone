// Tiny static server for the HTML mockups in docs/mockups. Not part of the app.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const root = new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const types = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split("?")[0])).split("..").join("");
  const file = join(root, path === "/" || path === "\\" ? "index.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(4321, () => console.log("mockups on http://localhost:4321"));
