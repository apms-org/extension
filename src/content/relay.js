(() => {
  if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.id) return;
  const REQ = "apm:webauthn:req";
  const RES = "apm:webauthn:res";
  const pending = new Map();
  let port = null;
  let pinger = null;

  const answer = (d) => {
    try { window.dispatchEvent(new CustomEvent(RES, { detail: JSON.stringify(d) })); } catch (e) {}
  };

  function keepAlive() {
    const need = Array.from(pending.values()).some((m) => m.options && m.options.mediation === "conditional");
    if (need && !pinger) pinger = setInterval(() => { try { connect().postMessage({ t: "ping", reqId: "ping" }); } catch (e) {} }, 20000);
    if (!need && pinger) { clearInterval(pinger); pinger = null; }
  }

  function connect() {
    if (port) return port;
    port = chrome.runtime.connect({ name: "pk" });
    port.onMessage.addListener((d) => {
      if (!d || !d.reqId) return;
      pending.delete(d.reqId);
      keepAlive();
      answer(d);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      void chrome.runtime.lastError;
      const left = Array.from(pending.values());
      for (const m of left) {
        if (m.options && m.options.mediation === "conditional") {
          setTimeout(() => { try { connect().postMessage(m); } catch (e) { pending.delete(m.reqId); answer({ reqId: m.reqId, fallback: true }); } }, 250);
        } else {
          pending.delete(m.reqId);
          answer({ reqId: m.reqId, fallback: true });
        }
      }
      keepAlive();
    });
    return port;
  }

  window.addEventListener(REQ, (e) => {
    let d = null;
    try { d = JSON.parse(e.detail); } catch (err) { return; }
    if (!d || !d.reqId || typeof d.t !== "string") return;
    if (d.t === "cancel") {
      pending.delete(d.reqId);
      keepAlive();
      try { connect().postMessage({ t: "cancel", reqId: d.reqId }); } catch (err) {}
      return;
    }
    if (d.t !== "create" && d.t !== "get") return;
    const msg = { t: d.t, reqId: d.reqId, options: d.options || {} };
    pending.set(d.reqId, msg);
    answer({ reqId: d.reqId, ack: true });
    try { connect().postMessage(msg); } catch (err) { pending.delete(d.reqId); answer({ reqId: d.reqId, fallback: true }); }
    keepAlive();
  }, true);
})();
