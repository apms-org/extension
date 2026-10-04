import { post, enc } from "./bridge.js";
import { getStatus, getItems, getSettings, blocks, invalidate, pauseSite } from "./state.js";
import { loginsFor, parseUrl, baseDomain, isWebPage } from "../shared/domain.js";
import { newSession, getSession, dropSession, toFrame, toPort, topFrame } from "./frames.js";
import { lastFillOf, pwHash } from "./autofill.js";
import { optionsStrength } from "../shared/gen.js";
import { withIcons } from "./icons.js";

const pending = new Map();
const SKEY = (tabId) => "apm.cand." + tabId;

async function remember(tabId, p) {
  pending.set(tabId, p);
  try { await chrome.storage.session.set({ [SKEY(tabId)]: p }); } catch (e) {}
}

async function recall(tabId) {
  if (pending.has(tabId)) return pending.get(tabId);
  try {
    const r = await chrome.storage.session.get(SKEY(tabId));
    if (r[SKEY(tabId)]) { pending.set(tabId, r[SKEY(tabId)]); return r[SKEY(tabId)]; }
  } catch (e) {}
  return null;
}

export async function forget(tabId) {
  pending.delete(tabId);
  try { await chrome.storage.session.remove(SKEY(tabId)); } catch (e) {}
}

function titleFor(host) {
  const base = baseDomain(host) || host;
  const name = base.split(".")[0] || base;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function reveal(id) {
  const r = await post("/api/items/" + enc(id) + "/reveal", { key: "password" });
  return r.ok ? String(r.value || "") : null;
}

export async function onSubmitted(sender, msg) {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null || !isWebPage(sender.url)) return { ok: true };
  const password = String(msg.password || "");
  if (!password || password.length > 512) return { ok: true };
  const s = await getSettings();
  if (!s.offerSave && !s.offerUpdate) return { ok: true };
  if (await blocks(sender.url, "save")) return { ok: true };
  const st = await getStatus();
  if (!st.unlocked) return { ok: true };
  const u = parseUrl(sender.url);
  const username = String(msg.username || "").trim().slice(0, 256);
  const lf = lastFillOf(tabId);
  if (lf && lf.host === u.hostname && (!username || lf.username.toLowerCase() === username.toLowerCase()) && lf.pw === await pwHash(password)) return { ok: true };
  const { items } = await getItems(true);
  const logins = loginsFor(items, sender.url, s.matchMode);
  let kind = null;
  let item = null;
  if (username) {
    item = logins.find((l) => (l.username || "").toLowerCase() === username.toLowerCase()) || null;
  } else if (msg.change && logins.length === 1) {
    item = logins[0];
  } else if (lf) {
    item = logins.find((l) => l.id === lf.itemId) || null;
  }
  if (item) {
    const current = await reveal(item.id);
    if (current === null || current === password) return { ok: true };
    if (!s.offerUpdate) return { ok: true };
    kind = "update";
  } else {
    if (!s.offerSave || !username) return { ok: true };
    kind = "save";
  }
  const p = { kind, tabId, host: u.hostname, origin: u.origin, url: sender.url, username, password, itemId: item ? item.id : null, at: Date.now(), shown: false, frameUrl: sender.url };
  await remember(tabId, p);
  setTimeout(() => { show(tabId, false); }, msg.navigating ? 2500 : 900);
  return { ok: true };
}

export async function show(tabId, fromHello) {
  const p = await recall(tabId);
  if (!p || p.shown) return;
  if (Date.now() - p.at > 90000) { await forget(tabId); return; }
  const top = topFrame(tabId);
  if (!top || !isWebPage(top.url)) return;
  const s = newSession(p.kind, tabId, 0, { tabId });
  const res = await toFrame(tabId, 0, { t: "bg:prompt", session: s.id, kind: p.kind });
  if (!res || !res.ok) { dropSession(s.id); return; }
  p.shown = true;
  await remember(tabId, p);
}

export async function promptInit(s) {
  const p = await recall(s.tabId);
  if (!p) return { ok: false, code: "gone" };
  const st = await getStatus();
  const s2 = await getSettings();
  const { items, spaces } = await getItems();
  const str = optionsStrength(p.password);
  const base = { kind: p.kind, host: p.host, username: p.username, passwordLength: p.password.length, strength: { score: str.score, bits: str.bits }, spaces, unlocked: !!st.unlocked };
  if (p.kind === "update") {
    const it = items.find((i) => i.id === p.itemId);
    if (!it) return { ok: false, code: "gone" };
    const [ic] = await withIcons([it], 600);
    return Object.assign(base, { ok: true, item: { id: it.id, title: it.title, username: it.username, space: it.space, icon: ic.icon || "", modified: it.modified, created: it.created, reused: it.health ? it.health.reused : [], weak: it.health ? it.health.weak : false } });
  }
  let name = titleFor(p.host);
  const taken = (title, space) => items.some((i) => i.type === "password" && i.title.toLowerCase() === title.toLowerCase() && (i.space || "") === (space || ""));
  const space = s2.saveSpace && s2.saveSpace !== "ask" && spaces.some((x) => x.name === s2.saveSpace) ? s2.saveSpace : "";
  if (taken(name, space) && p.username) name = name + " (" + p.username + ")";
  return Object.assign(base, { ok: true, name, space, takenNames: items.filter((i) => i.type === "password").map((i) => ({ title: i.title, space: i.space || "" })) });
}

export async function promptAction(s, msg) {
  const p = await recall(s.tabId);
  if (!p) return { ok: false, code: "gone", error: "This prompt expired." };
  if (msg.t === "reveal") return { ok: true, password: p.password };
  if (msg.t === "never") {
    await pauseSite(p.url, "save");
    await forget(s.tabId);
    return { ok: true, host: baseDomain(p.host) };
  }
  if (msg.t === "dismiss") {
    await forget(s.tabId);
    return { ok: true };
  }
  if (msg.t === "save") {
    const name = String(msg.name || "").trim();
    if (!name) return { ok: false, code: "invalid", error: "Give the login a name." };
    const r = await post("/api/items", { type: "password", space: msg.space || "", f: { account: name, username: String(msg.username != null ? msg.username : p.username), password: p.password, website: p.host } });
    if (!r.ok) return r;
    invalidate();
    await forget(s.tabId);
    return { ok: true, item: r.item };
  }
  if (msg.t === "update") {
    const r = await post("/api/items/" + enc(p.itemId) + "/update", { f: { password: p.password }, note: "Changed the password on " + p.host + " from the browser" });
    if (!r.ok) return r;
    invalidate();
    await forget(s.tabId);
    return { ok: true, item: r.item };
  }
  return { ok: false, code: "invalid", error: "Unknown action." };
}
