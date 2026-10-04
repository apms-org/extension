import test from "node:test";
import assert from "node:assert/strict";

// bridge.js keeps its connection in module state, so each test loads a fresh copy.
let copy = 0;
const load = () => import("../src/background/bridge.js?copy=" + ++copy);

function fakeBrowser({ app = false, host = null, missing = false } = {}) {
  const env = { app, connects: 0, posted: [], ports: [], store: { "apm.token": "t".repeat(64) } };
  globalThis.fetch = async (url, init) => {
    if (!env.app) throw new TypeError("Failed to fetch");
    return { status: 200, json: async () => ({ ok: true, via: "app", path: url.replace(/^http:\/\/127\.0\.0\.1:\d+/, ""), token: init.headers["x-apm-token"] || "" }) };
  };
  globalThis.chrome = {
    runtime: {
      lastError: null,
      connectNative(name) {
        env.connects++;
        env.name = name;
        const msg = new Set();
        const gone = new Set();
        const port = {
          open: true,
          onMessage: { addListener: (fn) => msg.add(fn) },
          onDisconnect: { addListener: (fn) => gone.add(fn) },
          postMessage(m) { env.posted.push(m); if (host) queueMicrotask(() => host(m, port)); },
          disconnect() { port.open = false; },
          emit(m) { msg.forEach((fn) => fn(m)); },
          drop(err) { port.open = false; globalThis.chrome.runtime.lastError = err ? { message: err } : null; gone.forEach((fn) => fn()); globalThis.chrome.runtime.lastError = null; }
        };
        env.ports.push(port);
        if (missing) queueMicrotask(() => port.drop("Specified native messaging host not found."));
        return port;
      }
    },
    storage: { local: { get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in env.store).map((k) => [k, env.store[k]])), set: async (o) => Object.assign(env.store, o), remove: async () => {} } }
  };
  return env;
}

test("uses the app when it answers, and never starts pm", async () => {
  const env = fakeBrowser({ app: true });
  const b = await load();
  const r = await b.get("/api/status");
  assert.equal(r.via, "app");
  assert.equal(r.token, "t".repeat(64));
  assert.equal(env.connects, 0);
  assert.equal(b.transport().via, "app");
});

test("falls back to pm over native messaging when the app is closed", async () => {
  const env = fakeBrowser({ host: (m, port) => port.emit({ id: m.id, status: 200, body: { ok: true, unlocked: false } }) });
  const b = await load();
  const r = await b.get("/api/status");
  assert.deepEqual(r, { ok: true, unlocked: false });
  assert.equal(env.name, "dev.apm.bridge");
  const sent = env.posted[0];
  assert.equal(sent.method, "GET");
  assert.equal(sent.path, "/api/status");
  assert.equal(sent.token, "t".repeat(64));
  assert.ok(sent.client.length > 0);
  assert.equal(b.transport().via, "native");
  assert.equal(b.transport().linked, true);
});

test("public calls leave the token out", async () => {
  const env = fakeBrowser({ host: (m, port) => port.emit({ id: m.id, status: 200, body: { ok: true } }) });
  const b = await load();
  await b.post("/api/pair/start", { client: "x" }, { public: true });
  assert.equal(env.posted[0].token, "");
  assert.deepEqual(env.posted[0].body, { client: "x" });
});

test("joins an answer that pm sent in parts", async () => {
  const value = "é".repeat(1000);
  fakeBrowser({
    host: (m, port) => {
      const whole = JSON.stringify({ id: m.id, status: 200, body: { ok: true, value } });
      const cut = [0, 700, 1500, whole.length];
      const parts = cut.slice(1).map((end, i) => whole.slice(cut[i], end));
      parts.reverse().forEach((chunk, j) => port.emit({ id: m.id, part: parts.length - 1 - j, parts: parts.length, chunk }));
    }
  });
  const b = await load();
  const r = await b.post("/api/items/x/reveal", { key: "content" });
  assert.equal(r.value, value);
});

test("refusals keep their code", async () => {
  fakeBrowser({ host: (m, port) => port.emit({ id: m.id, status: 423, body: { ok: false, code: "locked", error: "Unlock first." } }) });
  const b = await load();
  const r = await b.get("/api/items");
  assert.equal(r.ok, false);
  assert.equal(r.code, "locked");
  assert.equal(r.status, 423);
});

test("an unlinked browser reports offline and not linked", async () => {
  fakeBrowser({ missing: true });
  const b = await load();
  const r = await b.get("/api/status");
  assert.equal(r.code, "offline");
  assert.equal(b.transport().linked, false);
  assert.match(b.transport().error, /not found/);
});

test("pm's events reach listeners", async () => {
  const env = fakeBrowser({ host: (m, port) => port.emit({ id: m.id, status: 200, body: { ok: true } }) });
  const b = await load();
  const seen = [];
  b.onHostEvent((ev) => seen.push(ev.event));
  await b.get("/api/status");
  env.ports[0].emit({ event: "vault.locked", data: { reason: "Locked after 15 minutes idle" } });
  env.ports[0].drop("Native host has exited.");
  assert.deepEqual(seen, ["vault.locked", "host.gone"]);
  assert.equal(b.transport().via, null);
});

test("goes back to the app once it opens, and lets pm exit", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const env = fakeBrowser({ host: (m, port) => port.emit({ id: m.id, status: 200, body: { ok: true, from: "pm" } }) });
  const b = await load();
  assert.equal((await b.get("/api/status")).from, "pm");
  env.app = true;
  assert.equal((await b.get("/api/status")).from, "pm", "within 5s pm keeps answering");
  t.mock.timers.tick(5001);
  const r = await b.get("/api/status");
  assert.equal(r.via, "app");
  assert.equal(env.ports[0].open, false, "native port closed so pm drops the key and exits");
});

test("keeps pm running while the vault is unlocked through it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 2_000_000 });
  let unlocked = true;
  const env = fakeBrowser({ host: (m, port) => port.emit({ id: m.id, status: 200, body: { ok: true } }) });
  const b = await load();
  b.keepNativeWhile(() => unlocked);
  await b.get("/api/status");
  t.mock.timers.tick(31000);
  assert.equal(env.ports[0].open, true, "unlocked: pm holds the key, so the port stays");
  unlocked = false;
  await b.get("/api/status");
  t.mock.timers.tick(31000);
  assert.equal(env.ports[0].open, false, "locked: the port closes after a quiet spell");
});
