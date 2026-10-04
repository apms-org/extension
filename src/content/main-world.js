(() => {
  const nav = window.navigator;
  if (!nav || !nav.credentials || nav.credentials.__apm) return;
  const creds = nav.credentials;
  const realCreate = typeof creds.create === "function" ? creds.create.bind(creds) : null;
  const realGet = typeof creds.get === "function" ? creds.get.bind(creds) : null;
  if (!realCreate && !realGet) return;
  try { Object.defineProperty(creds, "__apm", { value: true }); } catch (e) {}

  const REQ = "apm:webauthn:req";
  const RES = "apm:webauthn:res";

  const toU8 = (b) => (b instanceof Uint8Array ? b : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b));
  const b64u = (buf) => {
    const u8 = toU8(buf);
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fromB64u = (s) => {
    let b = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    if (b.length % 4) b += "=".repeat(4 - (b.length % 4));
    const bin = atob(b);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  };
  const idOf = (x) => (typeof x === "string" ? x : x ? b64u(x) : "");

  function rid() {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function ask(msg, signal) {
    return new Promise((resolve) => {
      const reqId = rid();
      let done = false;
      let acked = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        window.removeEventListener(RES, onRes, true);
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve(v);
      };
      const onRes = (e) => {
        let d = null;
        try { d = JSON.parse(e.detail); } catch (err) { return; }
        if (!d || d.reqId !== reqId) return;
        if (d.ack) { acked = true; return; }
        finish(d);
      };
      const onAbort = () => {
        window.dispatchEvent(new CustomEvent(REQ, { detail: JSON.stringify({ t: "cancel", reqId }) }));
        finish({ aborted: true });
      };
      window.addEventListener(RES, onRes, true);
      if (signal) {
        if (signal.aborted) { finish({ aborted: true }); return; }
        signal.addEventListener("abort", onAbort);
      }
      window.dispatchEvent(new CustomEvent(REQ, { detail: JSON.stringify(Object.assign({ reqId }, msg)) }));
      setTimeout(() => { if (!acked) finish({ fallback: true }); }, 1500);
    });
  }

  function domError(e) {
    try { return new DOMException(e.message || "The operation failed.", e.name || "NotAllowedError"); } catch (err) { return new Error(e.message || "The operation failed."); }
  }

  function adopt(obj, proto) {
    try { if (proto) Object.setPrototypeOf(obj, proto); } catch (e) {}
    return obj;
  }

  function buildCreate(c) {
    const clientDataJSON = fromB64u(c.clientDataJSON);
    const attestationObject = fromB64u(c.attestationObject);
    const authData = fromB64u(c.authenticatorData);
    const spki = c.publicKey ? fromB64u(c.publicKey) : null;
    const transports = ["hybrid", "internal"];
    const response = adopt({
      clientDataJSON,
      attestationObject,
      getTransports: () => transports.slice(),
      getAuthenticatorData: () => authData,
      getPublicKey: () => spki,
      getPublicKeyAlgorithm: () => c.publicKeyAlgorithm || -7
    }, window.AuthenticatorAttestationResponse && AuthenticatorAttestationResponse.prototype);
    const json = { id: c.id, rawId: c.id, type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {}, response: { clientDataJSON: c.clientDataJSON, attestationObject: c.attestationObject, authenticatorData: c.authenticatorData, publicKey: c.publicKey, publicKeyAlgorithm: c.publicKeyAlgorithm || -7, transports } };
    return adopt({ id: c.id, rawId: fromB64u(c.id), type: "public-key", authenticatorAttachment: "platform", response, getClientExtensionResults: () => ({}), toJSON: () => json }, window.PublicKeyCredential && PublicKeyCredential.prototype);
  }

  function buildGet(c) {
    const response = adopt({
      clientDataJSON: fromB64u(c.clientDataJSON),
      authenticatorData: fromB64u(c.authenticatorData),
      signature: fromB64u(c.signature),
      userHandle: c.userHandle ? fromB64u(c.userHandle) : null
    }, window.AuthenticatorAssertionResponse && AuthenticatorAssertionResponse.prototype);
    const json = { id: c.id, rawId: c.id, type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {}, response: { clientDataJSON: c.clientDataJSON, authenticatorData: c.authenticatorData, signature: c.signature, userHandle: c.userHandle || undefined } };
    return adopt({ id: c.id, rawId: fromB64u(c.id), type: "public-key", authenticatorAttachment: "platform", response, getClientExtensionResults: () => ({}), toJSON: () => json }, window.PublicKeyCredential && PublicKeyCredential.prototype);
  }

  if (realCreate) {
    creds.create = async function (opts) {
      const pk = opts && opts.publicKey;
      if (!pk || !window.isSecureContext) return realCreate(opts);
      let payload;
      try {
        payload = {
          rp: { id: pk.rp && pk.rp.id, name: pk.rp && pk.rp.name },
          user: { id: pk.user && pk.user.id ? b64u(pk.user.id) : "", name: pk.user && pk.user.name, displayName: pk.user && pk.user.displayName },
          challenge: b64u(pk.challenge),
          pubKeyCredParams: (pk.pubKeyCredParams || []).map((p) => ({ type: p.type, alg: p.alg })),
          excludeCredentials: (pk.excludeCredentials || []).map((c) => ({ type: c.type, id: idOf(c.id) })),
          authenticatorSelection: pk.authenticatorSelection || {},
          attestation: pk.attestation || "none"
        };
      } catch (e) {
        return realCreate(opts);
      }
      const r = await ask({ t: "create", options: payload }, opts.signal);
      if (!r || r.fallback) return realCreate(opts);
      if (r.aborted) throw domError({ name: "AbortError", message: "The operation was aborted." });
      if (r.error) throw domError(r.error);
      if (r.credential) return buildCreate(r.credential);
      return realCreate(opts);
    };
  }

  if (realGet) {
    creds.get = async function (opts) {
      const pk = opts && opts.publicKey;
      if (!pk || !window.isSecureContext) return realGet(opts);
      let payload;
      try {
        payload = {
          rpId: pk.rpId,
          challenge: b64u(pk.challenge),
          allowCredentials: (pk.allowCredentials || []).map((c) => idOf(c.id)).filter(Boolean),
          userVerification: pk.userVerification || "preferred",
          mediation: opts.mediation || "optional"
        };
      } catch (e) {
        return realGet(opts);
      }
      const r = await ask({ t: "get", options: payload }, opts.signal);
      if (!r || r.fallback) return realGet(opts);
      if (r.aborted) throw domError({ name: "AbortError", message: "The operation was aborted." });
      if (r.error) throw domError(r.error);
      if (r.credential) return buildGet(r.credential);
      return realGet(opts);
    };
  }
})();
