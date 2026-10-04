import { KEYS, withDefaults, excludedRule } from "../shared/settings.js";
import { GEN_DEFAULTS } from "../shared/gen.js";
import { parseUrl, baseDomain } from "../shared/domain.js";
import { get, loadToken, transport, onHostEvent, keepNativeWhile } from "./bridge.js";

const listeners = new Set();
let status = null;
let statusAt = 0;
let statusPending = null;
let items = null;
let spaces = [];
let itemsAt = 0;
let itemsPending = null;

export const onStatusChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function getSettings() {
  const r = await chrome.storage.local.get(KEYS.settings);
  return withDefaults(r[KEYS.settings]);
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const next = Object.assign({}, cur, patch || {});
  await chrome.storage.local.set({ [KEYS.settings]: next });
  return next;
}

export async function getExcluded() {
  const r = await chrome.storage.local.get(KEYS.excluded);
  return Array.isArray(r[KEYS.excluded]) ? r[KEYS.excluded] : [];
}

export async function setExcluded(list) {
  const clean = (list || []).filter((x) => x && x.host).map((x) => ({ host: String(x.host).toLowerCase().trim(), rule: x.rule === "save" || x.rule === "fill" ? x.rule : "both" }));
  await chrome.storage.local.set({ [KEYS.excluded]: clean });
  return clean;
}

export async function ruleFor(url) {
  const p = parseUrl(url);
  if (!p) return null;
  return excludedRule(await getExcluded(), p.hostname);
}

export async function blocks(url, what) {
  const r = await ruleFor(url);
  if (!r) return false;
  return r === "both" || r === what;
}

export async function pauseSite(url, rule) {
  const p = parseUrl(url);
  if (!p) return getExcluded();
  const host = baseDomain(p.hostname);
  const list = (await getExcluded()).filter((x) => x.host !== host);
  list.unshift({ host, rule: rule || "both" });
  return setExcluded(list);
}

export async function resumeSite(url) {
  const p = parseUrl(url);
  if (!p) return getExcluded();
  const h = p.hostname;
  return setExcluded((await getExcluded()).filter((x) => !(h === x.host || h.endsWith("." + x.host))));
}

export async function getGen() {
  const r = await chrome.storage.local.get(KEYS.gen);
  return Object.assign({}, GEN_DEFAULTS, r[KEYS.gen] || {});
}

export async function setGen(o) {
  const next = Object.assign({}, GEN_DEFAULTS, o || {});
  await chrome.storage.local.set({ [KEYS.gen]: next });
  return next;
}

export async function getSpace() {
  const r = await chrome.storage.local.get(KEYS.space);
  return r[KEYS.space] || "all";
}

export async function setSpace(s) {
  await chrome.storage.local.set({ [KEYS.space]: s || "all" });
}

export async function getHints() {
  const r = await chrome.storage.local.get(KEYS.hints);
  return Array.isArray(r[KEYS.hints]) ? r[KEYS.hints] : [];
}

export async function addHint(rpId) {
  const list = await getHints();
  if (list.includes(rpId)) return;
  list.unshift(rpId);
  await chrome.storage.local.set({ [KEYS.hints]: list.slice(0, 500) });
}

function publish(prev, next) {
  const a = prev ? stateKey(prev) : "";
  const b = stateKey(next);
  if (a !== b) listeners.forEach((fn) => { try { fn(next, prev); } catch (e) {} });
}

export function stateKey(s) {
  if (!s) return "none";
  if (!s.paired) return (s.rejected ? "rejected" : "unpaired") + ":" + (s.via || "") + ":" + s.linked;
  if (!s.reachable) return "offline:" + s.linked;
  return (s.unlocked ? "unlocked" : "locked") + ":" + (s.via || "");
}

function withTransport(st) {
  const t = transport();
  return Object.assign(st, { via: st.reachable ? t.via : null, linked: t.linked, hostError: st.reachable ? "" : t.error });
}

async function fetchStatus() {
  const token = await loadToken();
  if (!token) {
    const info = await get("/api/info", { public: true, timeout: 2500 });
    return withTransport({ paired: false, reachable: info.ok, app: info.ok ? info.version : null });
  }
  const r = await get("/api/status", { timeout: 4000 });
  if (r.ok) return withTransport(Object.assign({ paired: true, reachable: true }, r));
  if (r.code === "offline") return withTransport({ paired: true, reachable: false });
  if (r.code === "unauthorized") return withTransport({ paired: false, rejected: true, reachable: true });
  return withTransport({ paired: true, reachable: true, unlocked: false, error: r.error });
}

keepNativeWhile(() => !!(status && status.unlocked && status.via === "native"));

onHostEvent((ev) => {
  if (ev.event === "vault.changed") { invalidate(); return; }
  if (ev.event === "vault.locked" || ev.event === "vault.unlocked" || ev.event === "host.gone") { invalidate(); getStatus(true); }
});

export async function getStatus(force) {
  if (!force && status && Date.now() - statusAt < 2500) return status;
  if (statusPending) return statusPending;
  statusPending = (async () => {
    const prev = status;
    const next = await fetchStatus();
    status = next;
    statusAt = Date.now();
    if (!next.unlocked) { items = null; spaces = []; itemsAt = 0; }
    publish(prev, next);
    return next;
  })();
  try { return await statusPending; } finally { statusPending = null; }
}

export function setStatus(next) {
  const prev = status;
  status = withTransport(Object.assign({ paired: true, reachable: true }, next));
  statusAt = Date.now();
  if (!status.unlocked) { items = null; spaces = []; itemsAt = 0; }
  publish(prev, status);
  return status;
}

export function invalidate() {
  items = null;
  itemsAt = 0;
}

export async function getItems(force) {
  const st = await getStatus();
  if (!st.unlocked) return { items: [], spaces: [] };
  if (!force && items && Date.now() - itemsAt < 15000) return { items, spaces };
  if (itemsPending) return itemsPending;
  itemsPending = (async () => {
    const r = await get("/api/items");
    if (r.ok) {
      items = r.items || [];
      spaces = r.spaces || [];
      itemsAt = Date.now();
      return { items, spaces };
    }
    if (r.code === "locked") await getStatus(true);
    return { items: [], spaces: [], error: r.error, code: r.code };
  })();
  try { return await itemsPending; } finally { itemsPending = null; }
}

export function cachedItems() {
  return items;
}
