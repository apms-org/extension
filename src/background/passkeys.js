import { get, post, enc } from "./bridge.js";
import { getStatus, getItems, getSettings, blocks, invalidate, getHints, addHint } from "./state.js";
import { rpAllowed, parseUrl, loginsFor } from "../shared/domain.js";
import { toB64u, sha256 } from "../shared/b64.js";
import { withIcons, iconsFor } from "./icons.js";
import { hostKey } from "../shared/iconkey.js";
import { originOf, newSession, getSession, dropSession, toFrame, topFrame } from "./frames.js";

const ceremonies = new Map();
let condHook = null;
export function onConditional(fn) { condHook = fn; }
const conditional = new Map();
const NOT_ALLOWED = { name: "NotAllowedError", message: "The operation either timed out or was not allowed." };

const hostOf = (origin) => (parseUrl(origin) || {}).hostname || "";

function uvFor(pref) {
  return pref !== "discouraged";
}

function clientData(type, challenge, origin, cross, topOrigin) {
  const o = { type, challenge, origin, crossOrigin: !!cross };
  if (cross && topOrigin) o.topOrigin = topOrigin;
  return JSON.stringify(o);
}

function frameContext(sender) {
  const origin = originOf(sender);
  const top = topFrame(sender.tab.id);
  const topOrigin = top ? top.origin : origin;
  return { origin, topOrigin, cross: sender.frameId !== 0 && topOrigin !== origin };
}

function makeReply(port, reqId) {
  return (x) => {
    const c = ceremonies.get(reqId);
    if (c) {
      c.done = true;
      ceremonies.delete(reqId);
      if (c.frameKey && conditional.get(c.frameKey) === reqId) conditional.delete(c.frameKey);
    }
    try { port.postMessage(Object.assign({ reqId }, x)); } catch (e) {}
  };
}

async function listFor(rpId, origin, allow) {
  const r = await get("/api/passkeys?rpId=" + enc(rpId) + "&origin=" + enc(origin));
  if (!r.ok) return [];
  let list = r.passkeys || [];
  if (allow && allow.length) {
    const set = new Set(allow);
    list = list.filter((p) => set.has(p.credentialId));
  }
  return list;
}

async function common(port, msg) {
  const sender = port.sender || {};
  const reply = makeReply(port, msg.reqId);
  if (!sender.tab) { reply({ fallback: true }); return null; }
  const s = await getSettings();
  if (!s.passkeys) { reply({ fallback: true }); return null; }
  const ctx = frameContext(sender);
  const o = msg.options || {};
  const rpId = String((msg.t === "create" ? o.rp && o.rp.id : o.rpId) || hostOf(ctx.origin)).toLowerCase();
  if (!rpAllowed(ctx.origin, rpId)) { reply({ fallback: true }); return null; }
  if (await blocks(sender.url, "fill")) { reply({ fallback: true }); return null; }
  const st = await getStatus();
  if (!st.paired || !st.reachable) { reply({ fallback: true }); return null; }
  return { sender, reply, ctx, o, rpId, st, tabId: sender.tab.id, frameId: sender.frameId };
}

async function openSheet(c, kind) {
  const sess = newSession(kind, c.tabId, 0, { reqId: c.reqId });
  c.sessionId = sess.id;
  sess.onEnd = () => {
    const live = ceremonies.get(c.reqId);
    if (live && !live.done) live.reply(live.fallbackOnEnd ? { fallback: true } : { error: live.errorOnEnd || NOT_ALLOWED });
  };
  const res = await toFrame(c.tabId, 0, { t: "bg:prompt", session: sess.id, kind });
  if (!res || !res.ok) {
    c.fallbackOnEnd = true;
    dropSession(sess.id);
  }
}

export async function onRelay(port, msg) {
  if (!msg || !msg.reqId) return;
  if (msg.t === "cancel") {
    const c = ceremonies.get(msg.reqId);
    if (c) {
      c.done = true;
      ceremonies.delete(msg.reqId);
      if (c.frameKey && conditional.get(c.frameKey) === msg.reqId) conditional.delete(c.frameKey);
      if (c.sessionId) dropSession(c.sessionId, true);
    }
    return;
  }
  if (msg.t === "ping") return;
  const base = await common(port, msg);
  if (!base) return;
  const c = Object.assign(base, { kind: msg.t, reqId: msg.reqId, port });
  if (msg.t === "create") {
    const params = c.o.pubKeyCredParams || [];
    if (params.length && !params.some((p) => p && p.type === "public-key" && p.alg === -7)) return c.reply({ fallback: true });
    ceremonies.set(c.reqId, c);
    return openSheet(c, "pk-create");
  }
  if (msg.t === "get") {
    const isCond = c.o.mediation === "conditional";
    if (!c.st.unlocked) {
      if (isCond) return c.reply({ fallback: true });
      if (!(await getHints()).includes(c.rpId)) return c.reply({ fallback: true });
      ceremonies.set(c.reqId, c);
      return openSheet(c, "pk-get");
    }
    const list = await listFor(c.rpId, c.ctx.origin, c.o.allowCredentials);
    if (!list.length) return c.reply({ fallback: true });
    c.list = list;
    ceremonies.set(c.reqId, c);
    if (isCond) {
      const key = c.tabId + ":" + c.frameId;
      const prev = conditional.get(key);
      if (prev && prev !== c.reqId) ceremonies.delete(prev);
      conditional.set(key, c.reqId);
      c.frameKey = key;
      if (condHook) condHook(c.tabId, c.frameId);
      return;
    }
    return openSheet(c, "pk-get");
  }
  c.reply({ fallback: true });
}

export function onRelayGone(port) {
  for (const [id, c] of ceremonies) {
    if (c.port !== port) continue;
    ceremonies.delete(id);
    if (c.frameKey && conditional.get(c.frameKey) === id) conditional.delete(c.frameKey);
    if (c.sessionId) dropSession(c.sessionId, true);
  }
}

export function conditionalFor(tabId, frameId) {
  const id = conditional.get(tabId + ":" + frameId);
  const c = id && ceremonies.get(id);
  if (!c || c.done) return null;
  return c;
}

export function passkeyView(p) {
  return { credentialId: p.credentialId, userName: p.userName || p.userDisplayName || "", label: p.label || "", entryName: p.entryName || "", entryId: p.entryId || "", space: p.space || "", lastUsedAt: p.lastUsedAt || 0, createdAt: p.createdAt || 0 };
}

export async function sheetInit(s) {
  const c = ceremonies.get(s.data.reqId);
  if (!c) return { ok: false, code: "gone" };
  const st = await getStatus(true);
  const base = { ok: true, kind: c.kind, rpId: c.rpId, origin: c.ctx.origin, unlocked: !!st.unlocked, touchId: st.touchId || {}, left: st.left };
  if (c.kind === "create") {
    const u = c.o.user || {};
    base.rpName = (c.o.rp && c.o.rp.name) || c.rpId;
    base.user = { name: u.name || "", displayName: u.displayName || u.name || "" };
    if (st.unlocked) {
      const { items, spaces } = await getItems();
      const s2 = await getSettings();
      const logins = items.filter((i) => i.type === "password");
      const seen = new Set();
      const suggested = loginsFor(logins, c.ctx.origin, s2.matchMode).concat(loginsFor(logins, "https://" + c.rpId, s2.matchMode)).filter((i) => !seen.has(i.id) && seen.add(i.id));
      const byUser = suggested.filter((i) => base.user.name && (i.username || "").toLowerCase() === base.user.name.toLowerCase());
      const view = (i) => ({ id: i.id, title: i.title, username: i.username, space: i.space, passkeys: i.passkeys, icon: i.icon || "" });
      base.suggested = (await withIcons(byUser.length ? byUser.concat(suggested.filter((i) => !byUser.includes(i))) : suggested, 800)).map(view);
      base.logins = (await withIcons(logins.filter((i) => !suggested.includes(i)), 0)).map(view);
      base.spaces = spaces;
      base.defaultSpace = s2.saveSpace && s2.saveSpace !== "ask" && spaces.some((x) => x.name === s2.saveSpace) ? s2.saveSpace : "";
    }
    return base;
  }
  if (st.unlocked && !c.list) c.list = await listFor(c.rpId, c.ctx.origin, c.o.allowCredentials);
  base.passkeys = (c.list || []).map(passkeyView);
  const h = hostKey("https://" + c.rpId);
  if (h) base.icon = (await iconsFor([h], 800))[h] || "";
  return base;
}

async function doCreate(c, target) {
  const cd = clientData("webauthn.create", c.o.challenge, c.ctx.origin, c.ctx.cross, c.ctx.topOrigin);
  const hash = toB64u(await sha256(cd));
  const u = c.o.user || {};
  const sel = c.o.authenticatorSelection || {};
  const r = await post("/api/passkeys/create", {
    origin: c.ctx.origin,
    rpId: c.rpId,
    rpName: (c.o.rp && c.o.rp.name) || c.rpId,
    user: { id: u.id || "", name: u.name || "", displayName: u.displayName || u.name || "" },
    clientDataHash: hash,
    uv: uvFor(sel.userVerification),
    excludeCredentials: (c.o.excludeCredentials || []).map((x) => x.id).filter(Boolean),
    target
  });
  if (!r.ok) {
    if (r.code === "exists") c.errorOnEnd = { name: "InvalidStateError", message: "The authenticator already contains a credential for this account." };
    return r;
  }
  invalidate();
  addHint(c.rpId);
  c.reply({ credential: { kind: "create", id: r.credentialId, clientDataJSON: toB64u(new TextEncoder().encode(cd)), attestationObject: r.attestationObject, authenticatorData: r.authenticatorData, publicKey: r.publicKey, publicKeyAlgorithm: r.publicKeyAlgorithm || -7 } });
  return { ok: true, entryName: r.entryName, entryId: r.entryId };
}

async function doAssert(c, credentialId) {
  const cd = clientData("webauthn.get", c.o.challenge, c.ctx.origin, c.ctx.cross, c.ctx.topOrigin);
  const hash = toB64u(await sha256(cd));
  const r = await post("/api/passkeys/assert", { origin: c.ctx.origin, rpId: c.rpId, credentialId, clientDataHash: hash, uv: uvFor(c.o.userVerification) });
  if (!r.ok) return r;
  invalidate();
  c.reply({ credential: { kind: "get", id: r.credentialId, clientDataJSON: toB64u(new TextEncoder().encode(cd)), authenticatorData: r.authenticatorData, signature: r.signature, userHandle: r.userHandle || "" } });
  return { ok: true, userName: r.userName || "" };
}

export async function sheetAction(s, msg) {
  const c = ceremonies.get(s.data.reqId);
  if (!c || c.done) return { ok: false, code: "gone", error: "The site stopped waiting. Try again on the page." };
  if (msg.t === "pk-fallback") {
    c.reply({ fallback: true });
    return { ok: true };
  }
  if (msg.t === "pk-create") {
    if (c.kind !== "create") return { ok: false, code: "invalid" };
    return doCreate(c, msg.target || {});
  }
  if (msg.t === "pk-pick") {
    if (c.kind !== "get") return { ok: false, code: "invalid" };
    if (!c.list) c.list = await listFor(c.rpId, c.ctx.origin, c.o.allowCredentials);
    if (!c.list.some((p) => p.credentialId === msg.credentialId)) return { ok: false, code: "not_found", error: "That passkey is not for this site." };
    return doAssert(c, msg.credentialId);
  }
  return { ok: false, code: "invalid" };
}

export async function conditionalPick(tabId, frameId, credentialId) {
  const c = conditionalFor(tabId, frameId);
  if (!c) return { ok: false, code: "gone", error: "The page is no longer asking for a passkey." };
  if (!c.list.some((p) => p.credentialId === credentialId)) return { ok: false, code: "not_found", error: "That passkey is not for this site." };
  return doAssert(c, credentialId);
}
