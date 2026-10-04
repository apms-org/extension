import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "icons");
const svg = fs.readFileSync(path.join(root, "vendor", "design-system", "apm-app-icon.svg"), "utf8");

function findChrome() {
  const env = process.env.CHROME_BIN;
  if (env && fs.existsSync(env)) return env;
  const caches = [path.join(os.homedir(), "Library/Caches/ms-playwright"), path.join(os.homedir(), ".cache/ms-playwright")].filter((p) => fs.existsSync(p));
  for (const cache of caches) {
    const dirs = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const p of ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-linux/chrome"]) {
        const full = path.join(cache, d, p);
        if (fs.existsSync(full)) return full;
      }
    }
  }
  for (const p of ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]) if (fs.existsSync(p)) return p;
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error("No Chrome or Chromium found. Set CHROME_BIN to render the icons.");
  process.exit(1);
}

const variants = [
  { name: "icon", filter: "none" },
  { name: "locked", filter: "grayscale(1) opacity(.55)" }
];
const sizes = [16, 32, 48, 128];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apm-icons-"));
fs.mkdirSync(out, { recursive: true });

for (const v of variants) {
  for (const size of sizes) {
    if (v.name === "locked" && size > 48) continue;
    const scale = 4;
    const html = path.join(tmp, v.name + "-" + size + ".html");
    const png = path.join(tmp, v.name + "-" + size + "@4.png");
    fs.writeFileSync(html, "<!doctype html><html><head><style>html,body{margin:0;background:transparent}div{width:" + size * scale + "px;height:" + size * scale + "px;filter:" + v.filter + "}svg{width:100%;height:100%;display:block}</style></head><body><div>" + svg + "</div></body></html>");
    const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000", "--force-device-scale-factor=1", "--window-size=" + size * scale + "," + size * scale, "--screenshot=" + png, "file://" + html], { encoding: "utf8" });
    if (r.status !== 0 || !fs.existsSync(png)) {
      console.error("Could not render " + v.name + " " + size + ": " + (r.stderr || "").slice(0, 400));
      process.exit(1);
    }
    const target = path.join(out, v.name + "-" + size + ".png");
    const sips = spawnSync("sips", ["-z", String(size), String(size), png, "--out", target], { encoding: "utf8" });
    if (sips.status !== 0) {
      fs.copyFileSync(png, target);
      console.log("sips is missing, kept a " + size * scale + "px render for " + path.basename(target));
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log("icons written to " + path.relative(root, out) + ": " + fs.readdirSync(out).sort().join(", "));
