const tabs = new Map();
const sessions = new Map();

export function isExtPage(sender) {
  return !!(sender && sender.id === chrome.runtime.id && sender.url && sender.url.startsWith(chrome.runtime.getURL("")));
}

export function isContent(sender) {
  return !!(sender && sender.id === chrome.runtime.id && sender.tab && !isExtPage(sender));
}

export function originOf(sender) {
  if (sender.origin && sender.origin !== "null") return sender.origin;
  try { return new URL(sender.url).origin; } catch (e) { return ""; }
}

export function noteFrame(sender, info) {
  if (!sender.tab) return null;
  const tabId = sender.tab.id;
  if (!tabs.has(tabId)) tabs.set(tabId, new Map());
  const frames = tabs.get(tabId);
  const prev = frames.get(sender.frameId);
  const rec = Object.assign({ frameId: sender.frameId, url: sender.url, origin: originOf(sender), at: Date.now() }, prev && prev.url === sender.url ? { focus: prev.focus } : {}, info || {});
  frames.set(sender.frameId, rec);
  return rec;
}

export function framesOf(tabId) {
  return tabs.has(tabId) ? Array.from(tabs.get(tabId).values()) : [];
}

export function topFrame(tabId) {
  return tabs.has(tabId) ? tabs.get(tabId).get(0) || null : null;
}

export function resetTab(tabId) {
  if (tabs.has(tabId)) tabs.get(tabId).clear();
  for (const [id, s] of sessions) if (s.tabId === tabId && s.kind !== "save" && s.kind !== "update") dropSession(id);
}

export function forgetTab(tabId) {
  tabs.delete(tabId);
  for (const [id, s] of sessions) if (s.tabId === tabId) dropSession(id);
}

export function allTabIds() {
  return Array.from(tabs.keys());
}

function rid() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newSession(kind, tabId, frameId, data) {
  for (const [id, s] of sessions) {
    if (s.tabId === tabId && s.frameId === frameId && s.kind === kind && kind !== "toast") dropSession(id, true);
  }
  const s = { id: rid(), kind, tabId, frameId, data: data || {}, created: Date.now(), port: null, onEnd: null };
  sessions.set(s.id, s);
  return s;
}

export function getSession(id) {
  return sessions.get(id) || null;
}

export function sessionsOf(tabId, kind) {
  return Array.from(sessions.values()).filter((s) => s.tabId === tabId && (!kind || s.kind === kind));
}

export function dropSession(id, notify) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  if (s.onEnd) { try { s.onEnd(); } catch (e) {} }
  if (notify) toFrame(s.tabId, s.frameId, { t: "bg:close", session: id });
  if (s.port) { try { s.port.disconnect(); } catch (e) {} }
}

export function attachPort(port, sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  const sender = port.sender || {};
  if (!isExtPage(sender) || !sender.tab || sender.tab.id !== s.tabId) return null;
  if (s.port && s.port !== port) { try { s.port.disconnect(); } catch (e) {} }
  s.port = port;
  port.onDisconnect.addListener(() => {
    if (s.port === port) s.port = null;
    if (sessions.get(s.id) === s && s.kind !== "pk-create" && s.kind !== "pk-get") dropSession(s.id, true);
  });
  return s;
}

export function toFrame(tabId, frameId, msg) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, { frameId }, (res) => {
        const err = chrome.runtime.lastError;
        resolve(err ? null : res);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

export function toPort(s, msg) {
  if (!s || !s.port) return false;
  try { s.port.postMessage(msg); return true; } catch (e) { return false; }
}
