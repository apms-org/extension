import { get, post, enc, setToken, loadToken, clientName } from "./bridge.js";

const KEY = "apm.pairing";
let pending = null;
let lastTry = 0;
let lastDenied = 0;
let looping = false;
let onPaired = null;

export function whenPaired(fn) { onPaired = fn; }

async function save() {
  try {
    if (pending) await chrome.storage.session.set({ [KEY]: pending });
    else await chrome.storage.session.remove(KEY);
  } catch (e) {}
}

async function restore() {
  if (pending) return pending;
  try {
    const r = await chrome.storage.session.get(KEY);
    if (r[KEY]) pending = r[KEY];
  } catch (e) {}
  return pending;
}

export async function pairState() {
  await restore();
  if (!pending) return null;
  if (pending.status === "pending" && Date.now() > pending.expires) pending.status = "expired";
  return { status: pending.status, code: pending.code, expires: pending.expires, via: pending.via || "app" };
}

async function approved(token) {
  await setToken(token);
  pending = pending ? Object.assign(pending, { status: "approved" }) : { status: "approved", code: "", expires: 0 };
  await save();
  if (onPaired) { try { await onPaired(); } catch (e) {} }
}

export async function pollOnce() {
  await restore();
  if (!pending || pending.status !== "pending") return pairState();
  if (Date.now() > pending.expires) { pending.status = "expired"; await save(); return pairState(); }
  const r = await get("/api/pair/poll?id=" + enc(pending.id), { public: true, timeout: 3000 });
  if (!r.ok) {
    if (r.code === "offline") return pairState();
    pending.status = r.code === "not_found" || r.code === "pair_expired" ? "expired" : "error";
    await save();
    return pairState();
  }
  if (r.status === "approved" && r.token) await approved(r.token);
  else if (r.status === "denied") { pending.status = "denied"; lastDenied = Date.now(); await save(); }
  else if (r.status === "expired") { pending.status = "expired"; await save(); }
  return pairState();
}

async function loop() {
  if (looping) return;
  looping = true;
  try {
    while (pending && pending.status === "pending" && Date.now() < pending.expires) {
      await new Promise((r) => setTimeout(r, 1500));
      await pollOnce();
    }
  } finally {
    looping = false;
  }
}

export async function startPairing(force) {
  if (await loadToken()) return { ok: true, status: "approved" };
  await restore();
  if (pending && pending.status === "pending" && Date.now() < pending.expires) {
    loop();
    return { ok: true, status: "pending", code: pending.code, expires: pending.expires, via: pending.via || "app" };
  }
  if (!force && (Date.now() - lastTry < 45000 || Date.now() - lastDenied < 10 * 60000)) return { ok: false, code: "throttled" };
  lastTry = Date.now();
  const r = await post("/api/pair/start", { client: clientName() }, { public: true, timeout: 4000 });
  if (!r.ok) return r;
  if (r.status === "approved" && r.token) {
    pending = { id: r.id, code: r.code || "", expires: r.expires || 0, status: "pending" };
    await approved(r.token);
    return { ok: true, status: "approved", auto: true };
  }
  pending = { id: r.id, code: r.code, expires: r.expires, status: "pending", via: r.via === "link" ? "link" : "app" };
  await save();
  loop();
  return { ok: true, status: "pending", code: r.code, expires: r.expires, via: pending.via };
}

export async function cancelPairing() {
  pending = null;
  await save();
}
