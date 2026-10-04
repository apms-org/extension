import { get, post, enc, setToken, loadToken, clientName, getPort, setPort, pairedAt, transport } from "./bridge.js";
import { getStatus, setStatus, getItems, getSettings, setSettings, getExcluded, setExcluded, getGen, setGen, getSpace, setSpace, invalidate, onStatusChange, blocks, ruleFor, pauseSite, resumeSite, stateKey, cachedItems } from "./state.js";
import { isExtPage, isContent, noteFrame, framesOf, topFrame, forgetTab, resetTab, allTabIds, newSession, getSession, dropSession, attachPort, toFrame, toPort, sessionsOf } from "./frames.js";
import { fillItem, fillBest, fillPassword, generateAndFill, fillOtp, otpItemFor, totpFor, matchesFor, orderForTab, gateFor, clipSeconds, copyOtpForTab, forgetTabFill, lastFillOf } from "./autofill.js";
import { onSubmitted, show as showPrompt, promptInit, promptAction, forget as forgetPrompt } from "./save.js";
import { onRelay, onRelayGone, sheetInit, sheetAction, conditionalFor, conditionalPick, passkeyView, onConditional } from "./passkeys.js";
import { copy, clearIfUnchanged } from "./clipboard.js";
import { iconsFor, withIcons, clearIcons } from "./icons.js";
import { startPairing, pollOnce, pairState, whenPaired, cancelPairing } from "./pairing.js";
import { loginsFor, parseUrl, otherItemsFor, isWebPage, baseDomain, stripWww } from "../shared/domain.js";

const ICON = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };
const LOCKED = { 16: "icons/locked-16.png", 32: "icons/locked-32.png", 48: "icons/locked-48.png" };

async function paintIcon(st) {
  const locked = !st || !st.paired || !st.reachable || !st.unlocked;
  try { await chrome.action.setIcon({ path: locked ? LOCKED : ICON }); } catch (e) {}
  try {
    await chrome.action.setTitle({ title: !st || !st.paired ? "APM · Connect to APM" : !st.reachable ? "APM · Not connected" : st.unlocked ? "APM" : "APM · Locked" });
  } catch (e) {}
}

async function paintBadge(tabId) {
  const top = topFrame(tabId);
  const st = await getStatus();
  let text = "";
  if (st.unlocked && top && isWebPage(top.url) && !(await blocks(top.url, "fill"))) {
    const n = (await matchesFor(top.url)).length;
    text = n ? String(n) : "";
  }
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#111113" });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" });
  } catch (e) {}
}

function paintAll() {
  for (const id of allTabIds()) paintBadge(id);
}

whenPaired(async () => { await getStatus(true); });

onConditional(async (tabId, frameId) => {
  const s = await getSettings();
  if (!s.passkeysInMenu) return;
  const open = sessionsOf(tabId, "menu").filter((x) => x.frameId === frameId && x.data.kind === "login");
  if (open.length) { for (const x of open) toPort(x, { t: "refresh" }); return; }
  toFrame(tabId, frameId, { t: "bg:passkey-ready" });
});

onStatusChange(async (next) => {
  if (next.rejected) { await setToken(null); startPairing(false); }
  if (!next.paired && next.reachable && !next.rejected) startPairing(false);
  paintIcon(next);
  paintAll();
  const ex = await getExcluded();
  for (const id of allTabIds()) {
    for (const f of framesOf(id)) toFrame(id, f.frameId, { t: "bg:state", on: !!next.paired && !!next.reachable && !blocksSync(ex, f.url), unlocked: !!next.unlocked });
  }
  if (!next.unlocked) {
    for (const id of allTabIds()) for (const s of sessionsOf(id, "menu")) toPort(s, { t: "status", status: publicStatus(next) });
  }
});

function publicStatus(st) {
  if (!st) return { paired: false };
  return { paired: !!st.paired, reachable: !!st.reachable, rejected: !!st.rejected, via: st.via || null, linked: st.linked == null ? null : !!st.linked, hostError: st.hostError || "", unlocked: !!st.unlocked, readonly: !!st.readonly, exists: st.exists !== false, name: st.name || "", version: st.version || st.app || "", items: st.items || 0, touchId: st.touchId || { available: false, configured: false }, cooldown: st.cooldown || 0, left: st.left, settings: st.settings || null, spaces: st.spaces || [], activeSpace: st.activeSpace || "" };
}

async function tabInfo(tabId) {
  let tab = null;
  try {
    if (tabId != null) tab = await chrome.tabs.get(tabId);
    else [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) { tab = null; }
  if (!tab) return null;
  const top = topFrame(tab.id);
  const url = (top && top.url) || tab.url || "";
  const p = parseUrl(url);
  return { id: tab.id, url, title: tab.title || "", host: p && isWebPage(url) ? p.hostname : "", origin: p ? p.origin : "", web: isWebPage(url), hasForm: framesOf(tab.id).some((f) => f.password || f.username || f.newpw || f.otp), hasPassword: framesOf(tab.id).some((f) => f.password || f.newpw) };
}

const lite = (i) => ({ id: i.id, type: i.type, title: i.title, sub: i.sub, username: i.username || "", space: i.space || "", fav: !!i.fav, urls: i.urls || [], totpId: i.totpId || "", passkeys: i.passkeys || 0, used: i.used || 0, modified: i.modified || 0, created: i.created || 0, health: i.health || null, hasSecret: !!i.hasSecret });

async function popupInit() {
  let st = await getStatus(true);
  if (!st.paired && st.reachable) {
    const r = await Promise.race([startPairing(false), new Promise((res) => setTimeout(() => res(null), 2500))]);
    if (r && r.ok && r.status === "approved") st = await getStatus(true);
  }
  const [s, gen, space, tab, pairing] = await Promise.all([getSettings(), getGen(), getSpace(), tabInfo(), pairState()]);
  const out = { status: publicStatus(st), pairing, settings: s, gen, space, tab, rule: null, items: [], spaces: [], matches: [], others: [], ext: chrome.runtime.getManifest().version, port: await getPort() };
  if (tab && tab.web) out.rule = await ruleFor(tab.url);
  if (st.unlocked) {
    const r = await getItems(true);
    out.items = await withIcons(r.items.map(lite), 1200);
    out.spaces = r.spaces;
    if (tab && tab.web) {
      out.matches = orderForTab(tab.id, loginsFor(r.items, tab.url, s.matchMode)).map((i) => i.id);
      out.others = otherItemsFor(r.items, tab.url, s.matchMode).map((i) => i.id);
    }
  }
  return out;
}

async function pairToken(token) {
  const t = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(t)) return { ok: false, code: "invalid", error: "That doesn't look like a pairing token. It is 64 letters and digits." };
  const prev = await loadToken();
  await setToken(t);
  const r = await get("/api/status");
  if (!r.ok) {
    await setToken(prev);
    if (r.code === "unauthorized") return { ok: false, code: "unauthorized", error: "APM rejected this token. Copy the current one from APM, Settings, Browser extension." };
    return r;
  }
  await getStatus(true);
  return { ok: true };
}

async function unlock(password) {
  const r = await post("/api/unlock", { password }, { timeout: 60000 });
  if (!r.ok) {
    if (r.code === "locked" || r.code === "unauthorized") await getStatus(true);
    return r;
  }
  if (r.status) setStatus(r.status); else await getStatus(true);
  invalidate();
  return { ok: true };
}

async function unlockTouch() {
  const r = await post("/api/unlock/touchid", {}, { timeout: 90000 });
  if (!r.ok) return r;
  if (r.status) setStatus(r.status); else await getStatus(true);
  invalidate();
  return { ok: true };
}

async function lock() {
  const r = await post("/api/lock", {});
  await getStatus(true);
  return r.ok ? { ok: true } : r;
}

function siteEntry(url) {
  const p = parseUrl(url);
  if (!p || !/^https?:$/.test(p.protocol) || !p.hostname.includes(".") && p.hostname !== "localhost") return null;
  return p.protocol === "https:" ? stripWww(p.host) : p.origin;
}

const sameSite = (a, b) => {
  const x = parseUrl(a);
  const y = parseUrl(b);
  return !!x && !!y && stripWww(x.host) === stripWww(y.host);
};

async function editSites(id, fn, note) {
  const r = await get("/api/items/" + enc(id));
  if (!r.ok) return r;
  const it = r.item || {};
  if (it.type !== "password") return { ok: false, code: "not_login", error: "Only logins have websites." };
  const f = it.f || {};
  const website = String(f.website || "");
  const urls = (Array.isArray(f.urls) ? f.urls : []).map(String).filter(Boolean);
  const next = fn(website, urls);
  if (!next) return { ok: true, unchanged: true };
  const res = await mutate("/api/items/" + enc(id) + "/update", { f: { website: next.website, urls: next.urls }, note });
  return res.ok ? Object.assign({ ok: true }, res) : res;
}

async function addSite(id, url) {
  let target = url;
  if (!target) {
    const tab = await tabInfo();
    if (!tab || !tab.web) return { ok: false, code: "invalid", error: "Open a site first." };
    target = tab.url;
  }
  const entry = siteEntry(target);
  if (!entry) return { ok: false, code: "invalid", error: "That doesn't look like a website. Try example.com." };
  const r = await editSites(id, (website, urls) => {
    if ([website].concat(urls).some((u) => u && sameSite(u, entry.includes("://") ? entry : "https://" + entry))) return null;
    return website ? { website, urls: urls.concat([entry]) } : { website: entry, urls };
  }, "Added " + entry + " from the browser");
  if (r.ok) r.site = entry;
  paintAll();
  return r;
}

async function removeSite(id, url) {
  const r = await editSites(id, (website, urls) => {
    const keep = urls.filter((u) => u !== url);
    if (website === url) return { website: keep[0] || "", urls: keep.slice(1) };
    if (keep.length === urls.length) return null;
    return { website, urls: keep };
  }, "Removed " + url + " from the browser");
  paintAll();
  return r;
}

async function mutate(path, body) {
  const r = await post(path, body);
  if (r.ok) invalidate();
  return r;
}

async function extApi(msg, sender) {
  switch (msg.t) {
    case "popup:init": return popupInit();
    case "status": return { ok: true, status: publicStatus(await getStatus(!!msg.force)) };
    case "pair:start": return startPairing(true);
    case "pair:poll": return Object.assign({ ok: true }, (await pollOnce()) || { status: "none" });
    case "pair:state": return Object.assign({ ok: true }, (await pairState()) || { status: "none" });
    case "pair:cancel": await cancelPairing(); return { ok: true };
    case "pair:token": return pairToken(msg.token);
    case "pair:forget": await clearIcons(); await setToken(null); await cancelPairing(); await getStatus(true); return { ok: true };
    case "vault:unlock": return unlock(String(msg.password || ""));
    case "vault:touchid": return unlockTouch();
    case "vault:lock": return lock();
    case "items": { const r = await getItems(!!msg.force); return { ok: true, items: await withIcons(r.items.map(lite), 0), spaces: r.spaces }; }
    case "icons": return { ok: true, icons: await iconsFor(Array.isArray(msg.hosts) ? msg.hosts.slice(0, 300).map(String) : [], 4000) };
    case "item:get": return get("/api/items/" + enc(msg.id));
    case "item:reveal": return post("/api/items/" + enc(msg.id) + "/reveal", { key: msg.key });
    case "item:add": return mutate("/api/items", { type: msg.type || "password", space: msg.space || "", f: msg.f || {}, fav: !!msg.fav });
    case "item:update": return mutate("/api/items/" + enc(msg.id) + "/update", { f: msg.f || {}, space: msg.space, note: msg.note });
    case "item:trash": return mutate("/api/items/" + enc(msg.id) + "/trash", {});
    case "site:add": return addSite(msg.id, msg.url ? String(msg.url) : "");
    case "site:remove": return removeSite(msg.id, String(msg.url || ""));
    case "item:fav": return mutate("/api/items/" + enc(msg.id) + "/favorite", { on: !!msg.on });
    case "totp:list": return get("/api/totp");
    case "totp:get": return totpFor(msg.id);
    case "passkeys:list": return get("/api/passkeys");
    case "passkeys:rename": return mutate("/api/passkeys/rename", { credentialId: msg.credentialId, label: msg.label });
    case "passkeys:remove": return mutate("/api/passkeys/remove", { credentialId: msg.credentialId });
    case "fill:item": {
      const tab = await tabInfo(msg.tabId);
      if (!tab) return { ok: false, code: "nofields", error: "Open a site first." };
      return fillBest(tab.id, msg.id, !!msg.force);
    }
    case "fill:password": {
      const tab = await tabInfo(msg.tabId);
      if (!tab) return { ok: false, code: "nofields", error: "Open a site first." };
      return fillPassword(tab.id, String(msg.value || ""));
    }
    case "probe": {
      const tab = await tabInfo(msg.tabId);
      if (!tab) return { ok: true, username: "" };
      for (const f of framesOf(tab.id)) {
        if (!f.username) continue;
        const r = await toFrame(tab.id, f.frameId, { t: "bg:probe" });
        if (r && r.username) return { ok: true, username: r.username };
      }
      return { ok: true, username: "" };
    }
    case "copy": {
      const st = await getStatus();
      const ok = await copy(String(msg.text == null ? "" : msg.text), msg.secret ? clipSeconds(st) : 0);
      return ok ? { ok: true, clearIn: msg.secret ? clipSeconds(st) : 0 } : { ok: false, code: "clipboard", error: "Chrome did not allow the copy. Try again." };
    }
    case "copy:reveal": {
      const r = await post("/api/items/" + enc(msg.id) + "/reveal", { key: msg.key });
      if (!r.ok) return r;
      const st = await getStatus();
      const ok = await copy(String(r.value || ""), clipSeconds(st));
      return ok ? { ok: true, clearIn: clipSeconds(st) } : { ok: false, code: "clipboard", error: "Chrome did not allow the copy. Try again." };
    }
    case "copy:totp": {
      const r = await totpFor(msg.id);
      if (!r.ok) return r;
      const st = await getStatus();
      await copy(r.code.code, clipSeconds(st));
      return { ok: true, code: r.code.code, clearIn: clipSeconds(st) };
    }
    case "settings:get": return { ok: true, settings: await getSettings() };
    case "settings:set": { const s = await setSettings(msg.patch); broadcastSettings(); return { ok: true, settings: s }; }
    case "excluded:get": return { ok: true, list: await getExcluded() };
    case "excluded:set": { const list = await setExcluded(msg.list); broadcastSettings(); paintAll(); return { ok: true, list }; }
    case "site:pause": { const tab = await tabInfo(msg.tabId); if (!tab || !tab.web) return { ok: false }; const list = await pauseSite(tab.url, msg.rule || "both"); broadcastSettings(); paintAll(); return { ok: true, list }; }
    case "site:resume": { const tab = await tabInfo(msg.tabId); if (!tab || !tab.web) return { ok: false }; const list = await resumeSite(tab.url); broadcastSettings(); paintAll(); return { ok: true, list }; }
    case "gen:get": return { ok: true, gen: await getGen() };
    case "gen:set": return { ok: true, gen: await setGen(msg.gen) };
    case "space:set": await setSpace(msg.space); return { ok: true };
    case "commands": return { ok: true, commands: await chrome.commands.getAll() };
    case "open:shortcuts": await chrome.tabs.create({ url: "chrome://extensions/shortcuts" }); return { ok: true };
    case "open:options": await chrome.runtime.openOptionsPage(); return { ok: true };
    case "bridge:info": return get("/api/info", { public: true, timeout: 2500 });
    case "conn:info": return Object.assign({ ok: true, port: await getPort(), pairedAt: await pairedAt(), client: clientName(), paired: !!(await loadToken()), id: chrome.runtime.id }, { via: transport().via, linked: transport().linked });
    case "conn:port": { const p = await setPort(msg.port); await cancelPairing(); const st = await getStatus(true); return { ok: true, port: p, status: publicStatus(st) }; }
    default: return { ok: false, code: "invalid", error: "Unknown request " + msg.t + "." };
  }
}

async function broadcastSettings() {
  const s = await getSettings();
  const ex = await getExcluded();
  for (const id of allTabIds()) {
    for (const f of framesOf(id)) toFrame(id, f.frameId, { t: "bg:settings", settings: contentSettings(s), paused: blocksSync(ex, f.url) });
  }
}

function blocksSync(list, url) {
  const p = parseUrl(url);
  if (!p) return false;
  return list.some((x) => (p.hostname === x.host || p.hostname.endsWith("." + x.host)) && (x.rule === "both" || x.rule === "fill"));
}

const contentSettings = (s) => ({ inlineMenu: s.inlineMenu, fieldIcon: s.fieldIcon, suggestPasswords: s.suggestPasswords, passkeysInMenu: s.passkeysInMenu });

async function contentApi(msg, sender) {
  const tabId = sender.tab.id;
  switch (msg.t) {
    case "cs:hello": {
      noteFrame(sender, { password: !!msg.password, username: !!msg.username, otp: !!msg.otp, newpw: !!msg.newpw });
      const [st, s] = await Promise.all([getStatus(), getSettings()]);
      if (sender.frameId === 0) { paintBadge(tabId); if (msg.fresh) setTimeout(() => showPrompt(tabId, true), 450); }
      const paused = await blocks(sender.url, "fill");
      return { ok: true, on: !!st.paired && !!st.reachable && !paused, unlocked: !!st.unlocked, settings: contentSettings(s) };
    }
    case "cs:focus": {
      const frames = framesOf(tabId);
      const f = frames.find((x) => x.frameId === sender.frameId) || noteFrame(sender, {});
      f.focus = { kind: msg.kind, at: Date.now() };
      return { ok: true };
    }
    case "cs:menu": return openMenu(sender, msg);
    case "cs:submitted": return onSubmitted(sender, msg);
    case "cs:closed": { const s = getSession(msg.session); if (s && s.tabId === tabId) dropSession(s.id); return { ok: true }; }
    case "cs:key": {
      const s = getSession(msg.session);
      if (s && s.tabId === tabId && s.frameId === sender.frameId) toPort(s, { t: "key", key: msg.key });
      return { ok: true };
    }
    default: return { ok: false, code: "invalid" };
  }
}

async function openMenu(sender, msg) {
  const tabId = sender.tab.id;
  const frameId = sender.frameId;
  const kind = msg.kind === "otp" || msg.kind === "newpw" ? msg.kind : "login";
  const explicit = !!msg.explicit;
  const [st, s] = await Promise.all([getStatus(), getSettings()]);
  if (!st.paired || !st.reachable) {
    if (!explicit) return { show: false };
    return { show: true, session: newSession("menu", tabId, frameId, { kind: "connect" }).id };
  }
  if (await blocks(sender.url, "fill")) return explicit ? { show: true, session: newSession("menu", tabId, frameId, { kind: "blocked", reason: "paused" }).id } : { show: false };
  if (!explicit && !s.inlineMenu) return { show: false };
  const frame = framesOf(tabId).find((f) => f.frameId === frameId) || noteFrame(sender, {});
  const top = topFrame(tabId);
  const gate = gateFor(frame, top ? top.url : sender.url, s);
  if (kind === "newpw") {
    if (!explicit && !s.suggestPasswords) return { show: false };
    return { show: true, session: newSession("menu", tabId, frameId, { kind: "newpw" }).id };
  }
  if (!st.unlocked) {
    if (!explicit && !msg.loginForm) return { show: false };
    return { show: true, session: newSession("menu", tabId, frameId, { kind: "locked", want: kind }).id };
  }
  if (gate) return explicit ? { show: true, session: newSession("menu", tabId, frameId, { kind: "blocked", reason: gate }).id } : { show: false };
  if (kind === "otp") {
    const it = await otpItemFor(tabId, sender.url);
    if (!it && !explicit) return { show: false };
    return { show: true, session: newSession("menu", tabId, frameId, { kind: "otp", itemId: it ? it.id : "" }).id };
  }
  const list = await matchesFor(sender.url);
  const cond = s.passkeysInMenu ? conditionalFor(tabId, frameId) : null;
  if (!list.length && !cond && !explicit) return { show: false };
  return { show: true, session: newSession("menu", tabId, frameId, { kind: "login" }).id };
}

async function menuInit(s) {
  const d = s.data;
  const st = await getStatus();
  const frame = framesOf(s.tabId).find((f) => f.frameId === s.frameId);
  const url = frame ? frame.url : "";
  const host = (parseUrl(url) || {}).hostname || "";
  const base = { ok: true, kind: d.kind, host, status: publicStatus(st) };
  if (d.kind === "login") {
    const list = orderForTab(s.tabId, await matchesFor(url));
    base.matches = (await withIcons(list.slice(0, 8), 600)).map((i) => ({ id: i.id, title: i.title, username: i.username, space: i.space, totp: !!i.totpId, fav: !!i.fav, icon: i.icon || "" }));
    base.more = Math.max(0, list.length - 8);
    const settings = await getSettings();
    const c = settings.passkeysInMenu ? conditionalFor(s.tabId, s.frameId) : null;
    base.passkeys = c ? c.list.map(passkeyView) : [];
  }
  if (d.kind === "otp" && d.itemId) {
    const { items } = await getItems();
    const it = items.find((i) => i.id === d.itemId);
    if (it) { const [x] = await withIcons([it], 600); base.item = { id: it.id, title: it.title, username: it.username || it.sub || "", space: it.space, icon: x.icon || "" }; }
    const lf = lastFillOf(s.tabId);
    base.recent = !!(lf && lf.itemId === d.itemId);
  }
  if (d.kind === "newpw") base.gen = await getGen();
  if (d.kind === "blocked") base.reason = d.reason;
  return base;
}

async function menuAction(s, msg) {
  switch (msg.t) {
    case "fill": {
      const r = await fillItem({ tabId: s.tabId, frameId: s.frameId, itemId: msg.id, session: s.id });
      if (r.ok) setTimeout(() => dropSession(s.id, true), 0);
      return r;
    }
    case "fill-otp": {
      const r = await fillOtp(s.tabId, s.frameId, msg.id);
      if (r.ok) setTimeout(() => dropSession(s.id, true), 0);
      return r;
    }
    case "fill-password": {
      const r = await fillPassword(s.tabId, String(msg.value || ""), s.frameId);
      if (r.ok) setTimeout(() => dropSession(s.id, true), 0);
      return r;
    }
    case "pk-pick": {
      const r = await conditionalPick(s.tabId, s.frameId, msg.credentialId);
      if (r.ok) setTimeout(() => dropSession(s.id, true), 0);
      return r;
    }
    case "totp": return totpFor(msg.id);
    case "gen:set": return { ok: true, gen: await setGen(msg.gen) };
    default: return { ok: false, code: "invalid" };
  }
}

async function reinit(s) {
  if (s.kind === "menu" && s.data.kind === "locked") {
    const st = await getStatus(true);
    if (st.unlocked) {
      const frame = framesOf(s.tabId).find((f) => f.frameId === s.frameId);
      if (s.data.want === "otp") {
        const it = frame ? await otpItemFor(s.tabId, frame.url) : null;
        s.data = { kind: "otp", itemId: it ? it.id : "" };
      } else if (s.data.want === "newpw") {
        s.data = { kind: "newpw" };
      } else {
        s.data = { kind: "login" };
      }
    }
  }
  return sessionInit(s);
}

async function sessionInit(s) {
  if (s.kind === "menu") return menuInit(s);
  if (s.kind === "save" || s.kind === "update") return promptInit(s);
  if (s.kind === "pk-create" || s.kind === "pk-get") return sheetInit(s);
  if (s.kind === "toast") return Object.assign({ ok: true, kind: "toast" }, s.data);
  return { ok: false, code: "gone" };
}

async function sessionAction(s, msg) {
  if (msg.t === "status") return { ok: true, status: publicStatus(await getStatus(true)) };
  if (msg.t === "reinit") return reinit(s);
  if (msg.t === "touchid" && (s.kind === "pk-create" || s.kind === "pk-get")) return unlockTouch();
  if (msg.t === "open-popup") {
    try { await chrome.action.openPopup(); return { ok: true }; } catch (e) { return { ok: false, code: "popup", error: "Click the APM icon in the toolbar." }; }
  }
  if (msg.t === "copy") {
    const st = await getStatus();
    const ok = await copy(String(msg.text || ""), msg.secret ? clipSeconds(st) : 0);
    return { ok };
  }
  if (s.kind === "menu") return menuAction(s, msg);
  if (s.kind === "save" || s.kind === "update") {
    const r = await promptAction(s, msg);
    if (r.ok && (msg.t === "save" || msg.t === "update")) paintBadge(s.tabId);
    return r;
  }
  if (s.kind === "pk-create" || s.kind === "pk-get") return sheetAction(s, msg);
  return { ok: false, code: "invalid" };
}

async function toast(tabId, title, description, tone) {
  const top = topFrame(tabId);
  if (!top || !isWebPage(top.url)) return;
  const s = newSession("toast", tabId, 0, { title, description: description || "", tone: tone || "success" });
  const res = await toFrame(tabId, 0, { t: "bg:prompt", session: s.id, kind: "toast" });
  if (!res || !res.ok) dropSession(s.id);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "pk") {
    const sender = port.sender || {};
    if (!isContent(sender)) { port.disconnect(); return; }
    port.onMessage.addListener((msg) => { onRelay(port, msg); });
    port.onDisconnect.addListener(() => onRelayGone(port));
    return;
  }
  if (port.name === "frame") {
    let s = null;
    port.onMessage.addListener(async (msg) => {
      if (!msg) return;
      if (msg.t === "hello") {
        s = attachPort(port, msg.session);
        if (!s) { try { port.postMessage({ t: "init", data: { ok: false, code: "gone" } }); } catch (e) {} port.disconnect(); return; }
        const data = await sessionInit(s);
        try { port.postMessage({ t: "init", data }); } catch (e) {}
        return;
      }
      if (!s || getSession(s.id) !== s) return;
      if (msg.t === "ping") return;
      if (msg.t === "resize") { toFrame(s.tabId, s.frameId, { t: "bg:size", session: s.id, height: msg.height, width: msg.width }); return; }
      if (msg.t === "close") {
        if (s.kind === "save" || s.kind === "update") forgetPrompt(s.tabId);
        dropSession(s.id, true);
        return;
      }
      if (msg.t === "toast") { toast(s.tabId, msg.title, msg.description, msg.tone); return; }
      let res;
      try { res = await sessionAction(s, msg); } catch (e) { res = { ok: false, code: "internal", error: String((e && e.message) || e) }; }
      try { port.postMessage(Object.assign({ t: "reply", rid: msg.rid }, res)); } catch (e) {}
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || !msg.t || msg.target === "offscreen" || sender.id !== chrome.runtime.id) return;
  const work = isExtPage(sender) && !msg.t.startsWith("cs:") ? extApi(msg, sender) : isContent(sender) && msg.t.startsWith("cs:") ? contentApi(msg, sender) : Promise.resolve({ ok: false, code: "forbidden" });
  work.then((r) => respond(r), (e) => respond({ ok: false, code: "internal", error: String((e && e.message) || e) }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") resetTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetTab(tabId);
  forgetTabFill(tabId);
  forgetPrompt(tabId);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  const tabId = tab && tab.id;
  if (command === "lock-vault") {
    const r = await lock();
    if (tabId != null && r.ok) toast(tabId, "APM locked", "Unlock it from the toolbar.", "neutral");
    return;
  }
  if (tabId == null) return;
  if (command === "fill-login") {
    const st = await getStatus();
    if (!st.unlocked) { toast(tabId, st.paired ? "APM is locked" : "Connect APM first", "Open APM from the toolbar.", "neutral"); return; }
    const r = await fillBest(tabId);
    if (!r.ok) toast(tabId, r.error || "Nothing to fill", null, "neutral");
    else if (r.totp === "copied") toast(tabId, "Filled " + r.username, "One-time code copied");
    return;
  }
  if (command === "generate-password") {
    const r = await generateAndFill(tabId);
    toast(tabId, r.ok ? "Filled a strong password" : r.error, r.ok ? "Copied too. APM offers to save it when you submit." : null, r.ok ? "success" : "neutral");
    return;
  }
  if (command === "copy-code") {
    const st = await getStatus();
    if (!st.unlocked) { toast(tabId, "APM is locked", "Open APM from the toolbar.", "neutral"); return; }
    const r = await copyOtpForTab(tabId);
    toast(tabId, r.ok ? "Copied one-time code" : r.error, r.ok ? r.title : null, r.ok ? "success" : "neutral");
  }
});

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "apm", title: "APM", contexts: ["editable"] });
    chrome.contextMenus.create({ id: "apm-login", parentId: "apm", title: "Fill a login", contexts: ["editable"] });
    chrome.contextMenus.create({ id: "apm-otp", parentId: "apm", title: "Fill a one-time code", contexts: ["editable"] });
    chrome.contextMenus.create({ id: "apm-newpw", parentId: "apm", title: "Suggest a strong password", contexts: ["editable"] });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  const kind = info.menuItemId === "apm-otp" ? "otp" : info.menuItemId === "apm-newpw" ? "newpw" : "login";
  toFrame(tab.id, info.frameId || 0, { t: "bg:open-menu", kind });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "apm-clip") clearIfUnchanged();
  if (a.name === "apm-status") getStatus(true).then((st) => { if (!st.paired && st.reachable) startPairing(false); });
});

chrome.windows.onRemoved.addListener(async () => {
  const s = await getSettings();
  if (!s.lockOnClose) return;
  const wins = await chrome.windows.getAll();
  if (!wins.length) lock();
});

chrome.runtime.onInstalled.addListener((d) => {
  setupMenus();
  if (d.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("options.html#welcome") });
});

chrome.runtime.onStartup.addListener(() => { setupMenus(); });

chrome.alarms.create("apm-status", { periodInMinutes: 1 });
getStatus(true).then(paintIcon);
