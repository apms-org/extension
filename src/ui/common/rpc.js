export function send(t, payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(Object.assign({ t }, payload || {}), (res) => {
        const err = chrome.runtime.lastError;
        resolve(err ? { ok: false, code: "internal", error: "The extension restarted. Try again." } : res || { ok: false, code: "internal", error: "No answer from the extension." });
      });
    } catch (e) {
      resolve({ ok: false, code: "internal", error: "The extension restarted. Reload the page." });
    }
  });
}

export function framePort(session, handlers) {
  const port = chrome.runtime.connect({ name: "frame" });
  const waiting = new Map();
  let n = 0;
  let alive = true;
  port.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.t === "reply" && waiting.has(msg.rid)) {
      const fn = waiting.get(msg.rid);
      waiting.delete(msg.rid);
      fn(msg);
      return;
    }
    const h = handlers[msg.t];
    if (h) h(msg);
  });
  port.onDisconnect.addListener(() => {
    alive = false;
    void chrome.runtime.lastError;
    for (const fn of waiting.values()) fn({ ok: false, code: "gone", error: "APM stopped listening. Close this and try again." });
    waiting.clear();
    if (handlers.gone) handlers.gone();
  });
  port.postMessage({ t: "hello", session });
  const ping = setInterval(() => { if (alive) { try { port.postMessage({ t: "ping" }); } catch (e) {} } }, 20000);
  return {
    ask(t, payload) {
      return new Promise((resolve) => {
        if (!alive) { resolve({ ok: false, code: "gone", error: "APM stopped listening." }); return; }
        const rid = ++n;
        waiting.set(rid, resolve);
        try { port.postMessage(Object.assign({ t, rid }, payload || {})); } catch (e) { waiting.delete(rid); resolve({ ok: false, code: "gone" }); }
      });
    },
    tell(t, payload) {
      if (!alive) return;
      try { port.postMessage(Object.assign({ t }, payload || {})); } catch (e) {}
    },
    close() {
      clearInterval(ping);
      if (!alive) return;
      try { port.postMessage({ t: "close" }); } catch (e) {}
    }
  };
}

export function sessionFromHash() {
  return (location.hash || "").replace(/^#/, "").replace(/[^a-f0-9]/g, "");
}

export function watchSize(el, port, extra) {
  let last = -1;
  const report = () => {
    const h = Math.ceil(el.getBoundingClientRect().height);
    if (h === last) return;
    last = h;
    port.tell("resize", Object.assign({ height: h }, extra || {}));
  };
  const ro = new ResizeObserver(report);
  ro.observe(el);
  report();
  return () => ro.disconnect();
}
