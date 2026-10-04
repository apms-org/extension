import { KEYS, PORT, NATIVE_HOST } from "../shared/settings.js";

let token = null;
let port = PORT;
let loaded = false;

export async function loadToken() {
  if (!loaded) {
    const r = await chrome.storage.local.get([KEYS.token, KEYS.port]);
    token = r[KEYS.token] || null;
    port = validPort(r[KEYS.port]) || PORT;
    loaded = true;
  }
  return token;
}

export async function setToken(t) {
  await loadToken();
  token = t || null;
  if (token) await chrome.storage.local.set({ [KEYS.token]: token, [KEYS.paired]: Date.now() });
  else await chrome.storage.local.remove([KEYS.token, KEYS.paired]);
}

const validPort = (x) => { const n = Number(x); return Number.isInteger(n) && n > 1023 && n < 65536 ? n : 0; };

export async function getPort() {
  await loadToken();
  return port;
}

export async function setPort(x) {
  await loadToken();
  const n = validPort(x) || PORT;
  port = n;
  if (n === PORT) await chrome.storage.local.remove(KEYS.port);
  else await chrome.storage.local.set({ [KEYS.port]: n });
  return n;
}

export async function pairedAt() {
  const r = await chrome.storage.local.get(KEYS.paired);
  return r[KEYS.paired] || 0;
}

export function clientName() {
  const d = navigator.userAgentData;
  let browser = "Chrome";
  let version = "";
  if (d && d.brands) {
    const pick = d.brands.find((b) => /Edge|Brave|Opera|Vivaldi|Arc/i.test(b.brand)) || d.brands.find((b) => /Google Chrome/i.test(b.brand)) || d.brands.find((b) => /Chromium/i.test(b.brand));
    if (pick) {
      browser = pick.brand.replace(/^Microsoft /, "").replace(/^Google /, "");
      version = pick.version;
    }
  } else {
    const m = navigator.userAgent.match(/Chrome\/(\d+)/);
    if (m) version = m[1];
  }
  const platform = (d && d.platform) || (/Mac/.test(navigator.userAgent) ? "macOS" : /Windows/.test(navigator.userAgent) ? "Windows" : "Linux");
  return (browser + (version ? " " + version : "") + " on " + platform).slice(0, 80);
}

const STATUS_CODE = { 400: "invalid", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "exists", 410: "pair_expired", 423: "locked", 429: "cooldown" };

const OFFLINE = { ok: false, code: "offline", error: "APM isn't connected. Open the APM app, or run pm extension link once.", status: 0 };

function answer(status, data) {
  if (!data) return { ok: false, code: "internal", error: "APM sent an answer the extension could not read.", status };
  if (data.ok === false || status >= 400) return { ok: false, code: data.code || STATUS_CODE[status] || "internal", error: data.error || "APM refused the request.", data: data.data || {}, status };
  return data;
}

async function http(method, path, body, o) {
  const headers = { "content-type": "application/json", "x-apm-client": clientName() };
  if (token && !o.public) headers["x-apm-token"] = token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeout || 8000);
  try {
    const res = await fetch("http://127.0.0.1:" + port + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal, cache: "no-store", credentials: "omit" });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return answer(res.status, data);
  } catch (e) {
    return OFFLINE;
  } finally {
    clearTimeout(timer);
  }
}

// With the app closed, the browser starts pm through native messaging (after
// pm extension link) and the same requests go over that port. The port stays
// open while the vault is unlocked, because pm holds the key only as long as
// it runs; otherwise it closes after a quiet spell and pm exits.

let via = null;
let nport = null;
let nseq = 0;
const nwait = new Map();
let linked = null;
let nativeError = "";
let appProbe = 0;
let release = null;
let keep = () => false;
const hostListeners = new Set();

const APP_PROBE_EVERY = 5000;
const RELEASE_AFTER = 30000;

export const onHostEvent = (fn) => { hostListeners.add(fn); return () => hostListeners.delete(fn); };
export const keepNativeWhile = (fn) => { keep = fn; };
export const transport = () => ({ via, linked, error: nativeError });

function hostEvent(ev) {
  hostListeners.forEach((fn) => { try { fn(ev); } catch (e) {} });
}

function dropNative() {
  clearTimeout(release);
  if (!nport) return;
  const p = nport;
  nport = null;
  try { p.disconnect(); } catch (e) {}
  for (const w of nwait.values()) { clearTimeout(w.timer); w.resolve(OFFLINE); }
  nwait.clear();
  if (via === "native") via = null;
}

function onNativeMessage(msg) {
  if (!msg) return;
  if (msg.event) { hostEvent(msg); return; }
  const w = nwait.get(Number(msg.id));
  if (!w) return;
  let whole = msg;
  if (msg.parts) {
    w.parts[msg.part] = msg.chunk;
    if (w.parts.filter((x) => x != null).length < msg.parts) return;
    try { whole = JSON.parse(w.parts.join("")); } catch (e) { whole = { status: 500, body: null }; }
  }
  nwait.delete(Number(msg.id));
  clearTimeout(w.timer);
  w.resolve(answer(whole.status || 200, whole.body));
}

function connectNative() {
  if (nport) return nport;
  let p;
  try { p = chrome.runtime.connectNative(NATIVE_HOST); } catch (e) { linked = false; nativeError = String((e && e.message) || e); return null; }
  nport = p;
  p.onMessage.addListener(onNativeMessage);
  p.onDisconnect.addListener(() => {
    const err = (chrome.runtime.lastError && chrome.runtime.lastError.message) || "";
    if (/not found/i.test(err)) linked = false;
    else if (/forbidden/i.test(err)) linked = false;
    nativeError = err;
    if (nport !== p) return;
    nport = null;
    const wasUp = via === "native";
    if (wasUp) via = null;
    for (const w of nwait.values()) { clearTimeout(w.timer); w.resolve(Object.assign({}, OFFLINE, { native: err })); }
    nwait.clear();
    if (wasUp) hostEvent({ event: "host.gone", data: { error: err } });
  });
  return p;
}

function native(method, path, body, o) {
  const p = connectNative();
  if (!p) return Promise.resolve(OFFLINE);
  const id = ++nseq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { nwait.delete(id); resolve({ ok: false, code: "timeout", error: "pm did not answer in time.", status: 0 }); }, o.timeout || 8000);
    nwait.set(id, { resolve, timer, parts: [] });
    try {
      p.postMessage({ id, method, path, body: body || null, token: token && !o.public ? token : "", client: clientName() });
    } catch (e) {
      clearTimeout(timer);
      nwait.delete(id);
      resolve(OFFLINE);
    }
  }).then((r) => {
    if (r.code !== "offline") { via = "native"; linked = true; nativeError = ""; }
    clearTimeout(release);
    release = setTimeout(() => { if (nwait.size === 0 && !keep()) dropNative(); }, RELEASE_AFTER);
    return r;
  });
}

export async function call(method, path, body, opts) {
  const o = opts || {};
  await loadToken();
  if (via === "native" && Date.now() - appProbe < APP_PROBE_EVERY) return native(method, path, body, o);
  const r = await http(method, path, body, o);
  if (r.code !== "offline") {
    if (via !== "app") { via = "app"; dropNative(); }
    return r;
  }
  appProbe = Date.now();
  if (via === "app") via = null;
  return native(method, path, body, o);
}

export const get = (path, opts) => call("GET", path, null, opts);
export const post = (path, body, opts) => call("POST", path, body || {}, opts);
export const enc = encodeURIComponent;
