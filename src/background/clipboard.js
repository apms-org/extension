const OFFSCREEN = "offscreen.html";
const CLEAR_KEY = "apm.clip";
let creating = null;

async function ensureOffscreen() {
  if (chrome.runtime.getContexts) {
    const ctx = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL(OFFSCREEN)] });
    if (ctx.length) return;
  }
  if (creating) return creating;
  creating = chrome.offscreen.createDocument({ url: OFFSCREEN, reasons: ["CLIPBOARD"], justification: "Copy secrets you ask for and clear them from the clipboard afterwards." }).catch((e) => {
    if (!/single offscreen|already exists/i.test(String(e && e.message))) throw e;
  });
  try { await creating; } finally { creating = null; }
}

function ask(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(Object.assign({ target: "offscreen" }, msg), (res) => {
      const err = chrome.runtime.lastError;
      resolve(err ? { ok: false } : res || { ok: false });
    });
  });
}

export async function copy(text, clearAfter) {
  await ensureOffscreen();
  const r = await ask({ t: "write", text: String(text == null ? "" : text) });
  if (!r.ok) return false;
  const secs = Number(clearAfter) || 0;
  if (secs > 0) {
    const when = Date.now() + secs * 1000;
    await chrome.storage.session.set({ [CLEAR_KEY]: { text: String(text), when } });
    if (secs < 30) setTimeout(() => { clearIfUnchanged(); }, secs * 1000);
    chrome.alarms.create("apm-clip", { when: Math.max(when, Date.now() + 30000) });
  }
  return true;
}

export async function clearIfUnchanged() {
  const r = await chrome.storage.session.get(CLEAR_KEY);
  const pending = r[CLEAR_KEY];
  if (!pending) return;
  if (Date.now() < pending.when - 500) return;
  await chrome.storage.session.remove(CLEAR_KEY);
  await ensureOffscreen();
  await ask({ t: "clear", expect: pending.text });
}
