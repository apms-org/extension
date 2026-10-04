import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "rolldown";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const vendor = path.join(root, "vendor", "design-system");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const argv = process.argv.slice(2);
const flag = (name) => { const a = argv.find((x) => x.startsWith("--" + name + "=")); return a ? a.slice(name.length + 3) : null; };
const watch = argv.includes("--watch");
const zip = argv.includes("--zip");
const dist = path.resolve(root, flag("out") || "dist");
const port = flag("port");
if (port && !/^\d{4,5}$/.test(port)) throw new Error("--port takes a number");

const JSX = { jsx: { runtime: "classic", pragma: "React.createElement", pragmaFrag: "React.Fragment" } };

function markSource() {
  const s = fs.readFileSync(path.join(vendor, "bundle.js"), "utf8");
  const at = s.indexOf("const MARK=");
  if (at < 0) throw new Error("MARK not found in vendor/design-system/bundle.js. Run npm run ds:sync.");
  const i = s.indexOf("{", at);
  let depth = 0;
  let j = i;
  for (; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) break;
  }
  const mark = JSON.parse(s.slice(i, j + 1));
  return "export const MARK = " + JSON.stringify(mark) + ";";
}

const virtual = {
  name: "apm-virtual",
  resolveId(id) { return id === "apm:mark" ? "\0apm:mark" : null; },
  load(id) { return id === "\0apm:mark" ? markSource() : null; },
  transform(code, id) {
    if (!port || !id.endsWith(path.join("shared", "settings.js"))) return null;
    const next = code.replace(/export const PORT = \d+;/, "export const PORT = " + port + ";");
    if (next === code) throw new Error("PORT not found in settings.js");
    return next;
  }
};

const ENTRIES = [
  { name: "background", input: "background/index.js", format: "esm" },
  { name: "offscreen", input: "offscreen/offscreen.js", format: "iife" },
  { name: "relay", input: "content/relay.js", format: "iife" },
  { name: "main-world", input: "content/main-world.js", format: "iife" },
  { name: "autofill", input: "content/autofill.js", format: "iife" },
  { name: "popup", input: "ui/popup/main.jsx", format: "iife", page: { title: "APM", cls: "page-popup" } },
  { name: "options", input: "ui/options/main.jsx", format: "iife", page: { title: "APM settings", cls: "page-options" } },
  { name: "inline", input: "ui/inline/main.jsx", format: "iife", page: { title: "APM", cls: "page-frame" } },
  { name: "prompt", input: "ui/prompt/main.jsx", format: "iife", page: { title: "APM", cls: "page-frame" } }
];

function manifest() {
  const key = JSON.parse(fs.readFileSync(path.join(root, "scripts", "extension-key.json"), "utf8"));
  return {
    manifest_version: 3,
    name: "APM",
    short_name: "APM",
    version: pkg.version,
    description: pkg.description,
    key: key.key,
    minimum_chrome_version: "116",
    icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
    action: { default_title: "APM", default_popup: "popup.html", default_icon: { 16: "icons/locked-16.png", 32: "icons/locked-32.png", 48: "icons/locked-48.png" } },
    options_ui: { page: "options.html", open_in_tab: true },
    background: { service_worker: "background.js", type: "module" },
    permissions: ["storage", "activeTab", "contextMenus", "offscreen", "alarms", "clipboardWrite", "clipboardRead", "nativeMessaging"],
    host_permissions: ["http://127.0.0.1/*"],
    content_scripts: [
      { matches: ["<all_urls>"], js: ["relay.js"], run_at: "document_start", all_frames: true, match_about_blank: true },
      { matches: ["<all_urls>"], js: ["main-world.js"], run_at: "document_start", all_frames: true, match_about_blank: true, world: "MAIN" },
      { matches: ["<all_urls>"], js: ["autofill.js"], run_at: "document_end", all_frames: true }
    ],
    web_accessible_resources: [{ resources: ["inline.html", "prompt.html"], matches: ["<all_urls>"], use_dynamic_url: false }],
    commands: {
      _execute_action: { suggested_key: { default: "Alt+Shift+A" }, description: "Open APM" },
      "fill-login": { suggested_key: { default: "Alt+Shift+F" }, description: "Fill the best login for this page" },
      "generate-password": { suggested_key: { default: "Alt+Shift+G" }, description: "Generate and fill a strong password" },
      "lock-vault": { suggested_key: { default: "Alt+Shift+L" }, description: "Lock the vault" },
      "copy-code": { description: "Copy the one-time code for this page" }
    },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" }
  };
}

function page(name, p) {
  return `<!doctype html>
<html lang="en" class="${p.cls}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${p.title}</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="ds.css">
<link rel="stylesheet" href="extension.css">
<link rel="stylesheet" href="ui.css">
</head>
<body>
<div id="root"></div>
<script src="react.production.min.js" charset="utf-8"></script>
<script src="react-dom.production.min.js" charset="utf-8"></script>
<script src="ds.js" charset="utf-8"></script>
<script src="${name}.js" charset="utf-8"></script>
</body>
</html>
`;
}

const OFFSCREEN = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>APM clipboard</title></head>
<body><script src="offscreen.js"></script></body>
</html>
`;

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function statics() {
  if (!fs.existsSync(path.join(vendor, "extension.css"))) throw new Error("extension.css not found in vendor/design-system. Run npm run ds:sync.");
  fs.mkdirSync(dist, { recursive: true });
  copy(path.join(vendor, "tokens.css"), path.join(dist, "tokens.css"));
  copy(path.join(vendor, "bundle.css"), path.join(dist, "ds.css"));
  copy(path.join(vendor, "bundle.js"), path.join(dist, "ds.js"));
  copy(path.join(vendor, "extension.css"), path.join(dist, "extension.css"));
  copy(path.join(vendor, "react.production.min.js"), path.join(dist, "react.production.min.js"));
  copy(path.join(vendor, "react-dom.production.min.js"), path.join(dist, "react-dom.production.min.js"));
  for (const f of fs.readdirSync(path.join(vendor, "fonts"))) copy(path.join(vendor, "fonts", f), path.join(dist, "fonts", f));
  for (const f of fs.readdirSync(path.join(root, "icons"))) if (f.endsWith(".png")) copy(path.join(root, "icons", f), path.join(dist, "icons", f));
  copy(path.join(src, "ui", "css", "ui.css"), path.join(dist, "ui.css"));
  for (const e of ENTRIES) if (e.page) fs.writeFileSync(path.join(dist, e.name + ".html"), page(e.name, e.page));
  fs.writeFileSync(path.join(dist, "offscreen.html"), OFFSCREEN);
  fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest(), null, 2) + "\n");
}

function options(e) {
  return {
    input: path.join(src, e.input),
    transform: JSX,
    plugins: [virtual],
    logLevel: "warn",
    output: { file: path.join(dist, e.name + ".js"), format: e.format, minify: false, comments: false, codeSplitting: false }
  };
}

async function once() {
  const t = Date.now();
  fs.rmSync(dist, { recursive: true, force: true });
  statics();
  for (const e of ENTRIES) await build(options(e));
  const size = fs.readdirSync(dist).filter((f) => f.endsWith(".js")).reduce((a, f) => a + fs.statSync(path.join(dist, f)).size, 0);
  console.log("built " + path.relative(root, dist) + " in " + (Date.now() - t) + "ms, " + Math.round(size / 1024) + " KB of scripts" + (port ? ", bridge port " + port : ""));
}

function pack() {
  const out = path.join(root, "apm-extension-" + pkg.version + ".zip");
  fs.rmSync(out, { force: true });
  execFileSync("zip", ["-qr", "-X", out, "."], { cwd: dist });
  console.log("wrote " + path.relative(root, out) + ", " + Math.round(fs.statSync(out).size / 1024) + " KB");
}

await once();
if (zip) pack();
if (watch) {
  let timer = null;
  const again = () => {
    clearTimeout(timer);
    timer = setTimeout(() => once().catch((e) => console.error(e.message)), 120);
  };
  fs.watch(src, { recursive: true }, again);
  fs.watch(vendor, { recursive: true }, again);
  console.log("watching src and vendor");
}
