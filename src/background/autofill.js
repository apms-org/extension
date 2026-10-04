import { post, get, enc } from "./bridge.js";
import { getStatus, getItems, getSettings, blocks, invalidate, getGen } from "./state.js";
import { loginsFor, parseUrl, isSecurePage, siteOf, isWebPage } from "../shared/domain.js";
import { sha256, toB64u } from "../shared/b64.js";
import { generate } from "../shared/gen.js";
import { framesOf, topFrame, toFrame } from "./frames.js";
import { copy } from "./clipboard.js";

const lastFill = new Map();
const pendingOtp = new Map();

export const clipSeconds = (st) => {
  const v = Number(st && st.settings && st.settings.clipboard);
  return Number.isFinite(v) && v >= 0 ? v : 30;
};

export async function pwHash(pw) {
  return toB64u(await sha256("apm-fill:" + String(pw || "")));
}

export function lastFillOf(tabId) {
  const f = lastFill.get(tabId);
  if (!f || Date.now() - f.at > 15 * 60000) return null;
  return f;
}

export function otpPendingOf(tabId) {
  const o = pendingOtp.get(tabId);
  if (!o || Date.now() > o.until) return null;
  return o;
}

export function forgetTabFill(tabId) {
  lastFill.delete(tabId);
  pendingOtp.delete(tabId);
}

export function gateFor(frame, tabUrl, settings) {
  if (!frame || !isWebPage(frame.url)) return "page";
  if (settings.neverHttp && !isSecurePage(frame.url)) return "http";
  if (frame.frameId !== 0 && tabUrl && siteOf(frame.url) !== siteOf(tabUrl) && !settings.crossFrames) return "frame";
  return null;
}

export async function matchesFor(url) {
  const st = await getStatus();
  if (!st.unlocked) return [];
  const [{ items }, s] = await Promise.all([getItems(), getSettings()]);
  return loginsFor(items, url, s.matchMode);
}

export function orderForTab(tabId, list) {
  const lf = lastFillOf(tabId);
  if (!lf) return list;
  const i = list.findIndex((x) => x.id === lf.itemId);
  if (i <= 0) return list;
  return [list[i]].concat(list.slice(0, i), list.slice(i + 1));
}

function tabUrlOf(tabId) {
  const top = topFrame(tabId);
  return top ? top.url : "";
}

export async function fillItem(o) {
  const { tabId, frameId, itemId, force, session } = o;
  const frame = framesOf(tabId).find((f) => f.frameId === frameId);
  if (!frame) return { ok: false, code: "nofields", error: "APM could not reach this page. Reload it and try again." };
  const s = await getSettings();
  const { items } = await getItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) return { ok: false, code: "not_found", error: "That login no longer exists." };
  if (item.type !== "password") return { ok: false, code: "not_login", error: "Only logins can be filled." };
  const host = (parseUrl(frame.url) || {}).hostname || "this page";
  if (!force) {
    if (!loginsFor([item], frame.url, s.matchMode).length) return { ok: false, code: "mismatch", error: item.title + " is not saved for " + host + "." };
    const gate = gateFor(frame, tabUrlOf(tabId), s);
    if (gate === "http") return { ok: false, code: "http", error: host + " is not encrypted. APM does not fill on http:// pages." };
    if (gate === "frame") return { ok: false, code: "frame", error: "This form is inside a frame from another site. Filling there is off in settings." };
    if (await blocks(frame.url, "fill")) return { ok: false, code: "paused", error: "APM is paused on " + host + "." };
  }
  const r = await post("/api/fill", { id: itemId });
  if (!r.ok) return r;
  const res = await toFrame(tabId, frameId, { t: "bg:fill", session, username: r.username || "", password: r.password || "" });
  if (!res || !res.ok) return { ok: false, code: "nofields", error: "APM could not find a login form on this page." };
  lastFill.set(tabId, { itemId, username: r.username || "", pw: await pwHash(r.password), at: Date.now(), host });
  invalidate();
  let totp = null;
  if (r.totp && r.totp.code) {
    pendingOtp.set(tabId, { itemId, until: Date.now() + 180000 });
    if (s.fillTotpAfterLogin) {
      const st = await getStatus();
      if (await copy(r.totp.code, clipSeconds(st))) totp = "copied";
    }
  }
  return { ok: true, filled: res.filled || {}, totp, title: item.title, username: r.username || "" };
}

export function candidateFrames(tabId, want) {
  const frames = framesOf(tabId).filter((f) => isWebPage(f.url));
  const score = (f) => {
    let n = 0;
    if (f.focus && Date.now() - f.focus.at < 60000) n += 8;
    if (want === "newpw" && f.newpw) n += 6;
    if (want === "otp" && f.otp) n += 6;
    if (f.password) n += 4;
    if (f.username) n += 2;
    if (f.frameId === 0) n += 1;
    return n;
  };
  return frames.filter((f) => f.password || f.username || f.otp || f.newpw).sort((a, b) => score(b) - score(a));
}

export async function refreshFrames(tabId) {
  await new Promise((resolve) => {
    try { chrome.tabs.sendMessage(tabId, { t: "bg:rehello" }, () => { void chrome.runtime.lastError; resolve(); }); } catch (e) { resolve(); }
  });
  await new Promise((r) => setTimeout(r, 180));
}

export async function fillBest(tabId, itemId, force) {
  const s = await getSettings();
  let frames = candidateFrames(tabId, "login");
  if (!frames.length) { await refreshFrames(tabId); frames = candidateFrames(tabId, "login"); }
  if (!frames.length) return { ok: false, code: "nofields", error: "There is no login form on this page." };
  if (itemId) {
    for (const f of frames) {
      const r = await fillItem({ tabId, frameId: f.frameId, itemId, force: false });
      if (r.ok || (r.code !== "mismatch" && r.code !== "nofields")) return r;
    }
    if (force) return fillItem({ tabId, frameId: frames[0].frameId, itemId, force: true });
    const top = frames[0];
    return { ok: false, code: "mismatch", error: "This login is not saved for " + ((parseUrl(top.url) || {}).hostname || "this page") + "." };
  }
  for (const f of frames) {
    const list = orderForTab(tabId, loginsFor((await getItems()).items, f.url, s.matchMode));
    if (list.length) return fillItem({ tabId, frameId: f.frameId, itemId: list[0].id });
  }
  return { ok: false, code: "none", error: "No saved logins match this page." };
}

export async function fillPassword(tabId, value, frameId) {
  let frames = frameId != null ? framesOf(tabId).filter((f) => f.frameId === frameId) : candidateFrames(tabId, "newpw");
  if (!frames.length && frameId == null) { await refreshFrames(tabId); frames = candidateFrames(tabId, "newpw"); }
  for (const f of frames) {
    const res = await toFrame(tabId, f.frameId, { t: "bg:fill-password", password: value });
    if (res && res.ok) return { ok: true, count: res.count || 1 };
  }
  return { ok: false, code: "nofields", error: "Click a password field on the page first." };
}

export async function generateAndFill(tabId) {
  const value = generate(await getGen());
  const r = await fillPassword(tabId, value);
  if (!r.ok) return r;
  const st = await getStatus();
  await copy(value, clipSeconds(st));
  return { ok: true, value };
}

export async function totpFor(id) {
  const r = await get("/api/totp/" + enc(id));
  if (!r.ok) return r;
  return { ok: true, now: r.now, code: r.code };
}

export async function otpItemFor(tabId, url) {
  const pend = otpPendingOf(tabId);
  const { items } = await getItems();
  if (pend) {
    const it = items.find((i) => i.id === pend.itemId);
    if (it && it.totpId) return it;
  }
  const list = orderForTab(tabId, await matchesFor(url)).filter((i) => i.totpId);
  if (list.length) return list[0];
  const s = await getSettings();
  const direct = items.filter((i) => i.type === "totp" && loginsFor([Object.assign({}, i, { type: "password" })], url, s.matchMode).length);
  return direct[0] || null;
}

export async function fillOtp(tabId, frameId, id) {
  const r = await totpFor(id);
  if (!r.ok) return r;
  const res = await toFrame(tabId, frameId, { t: "bg:fill-otp", code: r.code.code });
  if (!res || !res.ok) return { ok: false, code: "nofields", error: "APM could not find the code field." };
  pendingOtp.delete(tabId);
  return { ok: true, code: r.code.code };
}

export async function copyOtpForTab(tabId) {
  const top = topFrame(tabId);
  if (!top) return { ok: false, code: "nofields", error: "Open a site first." };
  const it = await otpItemFor(tabId, top.url);
  if (!it) return { ok: false, code: "none", error: "No one-time code is saved for this site." };
  const r = await totpFor(it.id);
  if (!r.ok) return r;
  const st = await getStatus();
  await copy(r.code.code, clipSeconds(st));
  return { ok: true, title: it.title };
}
