import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(root, "../../GUI/package.json"));
const { build } = await import(require.resolve("rolldown"));
const dist = path.join(root, "dist");

await build({
  input: path.join(root, "src", "main.jsx"),
  transform: { jsx: { runtime: "classic", pragma: "React.createElement", pragmaFrag: "React.Fragment" } },
  logLevel: "warn",
  output: { file: path.join(dist, "app.js"), format: "iife", minify: false, comments: false }
});
fs.copyFileSync(path.join(root, "src", "app.css"), path.join(dist, "app.css"));
console.log("built", fs.statSync(path.join(dist, "app.js")).size, "bytes");
