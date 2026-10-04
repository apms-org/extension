import { post } from "./bridge.js";
import { iconHost } from "../shared/iconkey.js";

export { iconHost };

const KEY = "apm.icons";
const MAX_BYTES = 1500000;
const MISS_TTL = 6 * 3600000;
let mem = null;
let loading = null;
let saveTimer = null;
let unsupported = false;
const waiting = new Set();

async function load() {
  if (mem) return mem;
  if (!loading) {
    loading = chrome.storage.local.get(KEY).then((r) => {
      mem = r[KEY] && typeof r[KEY] === "object" ? r[KEY] : {};
      return mem;
    }, () => { mem = {}; return mem; });
  }
  return loading;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const entries = Object.entries(mem).sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
    let size = 0;
    const keep = {};
    for (const [h, v] of entries) {
      size += (v.u ? v.u.length : 0) + h.length + 24;
      if (size > MAX_BYTES) break;
      keep[h] = v;
    }
    mem = keep;
    try { await chrome.storage.local.set({ [KEY]: keep }); } catch (e) {}
  }, 400);
}

function fresh(v) {
  return v && (v.u || Date.now() - (v.t || 0) < MISS_TTL);
}

export async function iconsFor(hosts, wait) {
  await load();
  const want = Array.from(new Set(hosts.filter(Boolean)));
  const out = {};
  const ask = [];
  for (const h of want) {
    const v = mem[h];
    if (v && v.u) out[h] = v.u;
    if (!fresh(v) && !waiting.has(h)) ask.push(h);
  }
  if (!ask.length || unsupported) return out;
  const job = fetchIcons(ask);
  if (wait) {
    const got = await Promise.race([job, new Promise((r) => setTimeout(() => r(null), wait))]);
    if (got) Object.assign(out, got);
  }
  return out;
}

async function fetchIcons(hosts, again) {
  for (const h of hosts) waiting.add(h);
  const got = {};
  try {
    for (let i = 0; i < hosts.length; i += 300) {
      const part = hosts.slice(i, i + 300);
      const r = await post("/api/icons", { hosts: part }, { timeout: 8000 });
      if (!r.ok) {
        if (r.code === "not_found" || r.status === 404) unsupported = true;
        return got;
      }
      const icons = r.icons || {};
      const pending = new Set(r.pending || []);
      for (const h of part) {
        if (pending.has(h)) continue;
        const u = typeof icons[h] === "string" && icons[h].startsWith("data:image/") ? icons[h] : "";
        mem[h] = { u, t: Date.now() };
        if (u) got[h] = u;
      }
      if (pending.size && !again) setTimeout(() => { fetchIcons(Array.from(pending), true); }, 2500);
    }
    persist();
    return got;
  } finally {
    for (const h of hosts) waiting.delete(h);
  }
}

export async function withIcons(list, wait) {
  const hosts = list.map((i) => iconHost(i));
  const map = await iconsFor(hosts, wait);
  return list.map((i, n) => (map[hosts[n]] ? Object.assign({}, i, { icon: map[hosts[n]] }) : i));
}

export async function clearIcons() {
  mem = {};
  unsupported = false;
  try { await chrome.storage.local.remove(KEY); } catch (e) {}
}
