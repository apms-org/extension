import { MARK } from "apm:mark";

(() => {
  if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.id) return;
  if (window.__apmAutofill) return;
  window.__apmAutofill = true;
  if (!/^https?:$/.test(location.protocol)) return;

  const TOP = window === window.top;
  const USER_RE = /user|login|e-?mail|account|identifier|phone|mobile|handle|\bid\b/i;
  const OTP_RE = /one[\s_-]?time|\botp\b|totp|2fa|mfa|two[\s_-]?factor|verification[\s_-]?code|security[\s_-]?code|auth(entication|enticator)?[\s_-]?code|passcode|\bcode\b|\btoken\b/i;
  const NEW_RE = /new|create|confirm|repeat|retype|again|sign[\s_-]?up|register|choose|set[\s_-]?password/i;
  const OLD_RE = /current|old|existing/i;
  const SIGNUP_RE = /sign[\s_-]?up|register|create (an |your )?account|join|get started/i;
  const SUBMIT_RE = /log ?in|sign ?in|sign ?up|continue|next|submit|register|create|verify|confirm|save|change|update|reset/i;
  const SKIP = new Set(["hidden", "submit", "button", "checkbox", "radio", "file", "image", "reset", "range", "color", "date", "datetime-local", "month", "week", "time", "search"]);

  const kinds = new WeakMap();
  const dismissed = new WeakSet();
  let state = { on: false, unlocked: false, settings: { inlineMenu: true, fieldIcon: true, suggestPasswords: true, passkeysInMenu: true } };
  let counts = "";
  let menu = null;
  let prompts = {};
  let marks = null;
  let lastContext = null;
  let lastSubmit = { key: "", at: 0 };

  const send = (msg) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => { void chrome.runtime.lastError; resolve(res || null); });
    } catch (e) {
      resolve(null);
    }
  });

  function isField(el) {
    return el instanceof HTMLInputElement && !SKIP.has((el.type || "text").toLowerCase()) && !el.disabled && !el.readOnly;
  }

  function visible(el) {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  }

  function hints(el) {
    let label = "";
    try { if (el.labels && el.labels[0]) label = el.labels[0].textContent || ""; } catch (e) {}
    return [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("autocomplete"), label, el.className && typeof el.className === "string" ? el.className : ""].join(" ");
  }

  function groupOf(el) {
    return el.form || el.closest("form") || el.closest("[role=dialog],[role=form],[class*=login i],[class*=signin i],[class*=sign-in i],[class*=auth i],[id*=login i],[id*=signin i]") || document.body;
  }

  function fieldsIn(root) {
    return Array.from(root.querySelectorAll("input")).filter((el) => isField(el) && visible(el));
  }

  function looksSignup(group) {
    const text = ((group.getAttribute && (group.getAttribute("action") || "") + " " + (group.id || "") + " " + (typeof group.className === "string" ? group.className : "")) || "") + " " + Array.from(group.querySelectorAll("button,input[type=submit],h1,h2,legend")).slice(0, 8).map((b) => b.textContent || b.value || "").join(" ");
    return SIGNUP_RE.test(text);
  }

  function isOtp(el) {
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (ac.includes("one-time-code")) return true;
    const t = (el.type || "text").toLowerCase();
    const max = el.maxLength > 0 ? el.maxLength : 0;
    const numeric = el.inputMode === "numeric" || t === "tel" || t === "number" || /\d/.test(el.pattern || "");
    if (max === 1 && numeric) {
      const sibs = Array.from(el.parentElement ? el.parentElement.parentElement ? el.parentElement.parentElement.querySelectorAll("input") : el.parentElement.querySelectorAll("input") : []).filter((x) => x.maxLength === 1);
      return sibs.length >= 4;
    }
    if (!OTP_RE.test(hints(el))) return false;
    if (/user|email|login|password/i.test(el.name + " " + el.id)) return false;
    return (max >= 4 && max <= 10) || numeric || ac.includes("otp");
  }

  function classify(el, fields) {
    const t = (el.type || "text").toLowerCase();
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (t === "password") {
      if (ac.includes("new-password")) return "newpw";
      if (ac.includes("current-password")) return "password";
      const h = hints(el);
      const group = groupOf(el);
      const pws = fields.filter((f) => f.type === "password" && groupOf(f) === group);
      if (pws.length >= 2) return OLD_RE.test(h) ? "password" : "newpw";
      if (NEW_RE.test(h) && !OLD_RE.test(h)) return "newpw";
      if (looksSignup(group)) return "newpw";
      return "password";
    }
    if (isOtp(el)) return "otp";
    if (t === "text" || t === "email" || t === "tel" || t === "") {
      const group = groupOf(el);
      const hasPw = fields.some((f) => f.type === "password" && groupOf(f) === group);
      if (ac.includes("username") || ac.includes("webauthn") || (ac.includes("email") && hasPw)) return "username";
      if (hasPw) {
        const pw = fields.find((f) => f.type === "password" && groupOf(f) === group);
        if (pw && (el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) && (t === "email" || USER_RE.test(hints(el)) || usernameFor(pw, fields) === el)) return "username";
        return null;
      }
      if ((t === "email" || /user|login|identifier|account/i.test(hints(el))) && fields.filter((f) => groupOf(f) === group).length <= 2 && hasSubmitNear(group)) return "username";
    }
    return null;
  }

  function hasSubmitNear(group) {
    if (group === document.body) return false;
    return Array.from(group.querySelectorAll("button,input[type=submit],[role=button]")).some((b) => SUBMIT_RE.test(b.textContent || b.value || b.getAttribute("aria-label") || ""));
  }

  function usernameFor(pw, fields) {
    const group = groupOf(pw);
    const list = (fields || fieldsIn(group)).filter((f) => groupOf(f) === group && f.type !== "password" && !isOtp(f));
    let best = null;
    for (const f of list) {
      if (f.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) best = f;
    }
    if (best) return best;
    const ac = list.find((f) => /username|email/i.test(f.getAttribute("autocomplete") || ""));
    return ac || null;
  }

  function scan() {
    const fields = fieldsIn(document);
    const out = { username: 0, password: 0, otp: 0, newpw: 0 };
    const seen = [];
    for (const el of fields) {
      const k = classify(el, fields);
      if (k) { kinds.set(el, k); out[k]++; seen.push(el); } else kinds.delete(el);
    }
    return { out, seen };
  }

  let scanTimer = null;
  let scanned = [];
  function rescan(force) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(async () => {
      const { out, seen } = scan();
      scanned = seen;
      const key = JSON.stringify(out);
      if (key !== counts || force) {
        counts = key;
        await hello();
      }
      paintMarks();
      if (menu && !menu.field.isConnected) closeMenu();
    }, force ? 0 : 350);
  }

  async function hello() {
    const c = JSON.parse(counts || "{}");
    const r = await send({ t: "cs:hello", username: !!c.username, password: !!c.password, otp: !!c.otp, newpw: !!c.newpw });
    if (r && r.ok) {
      state = { on: r.on, unlocked: r.unlocked, settings: r.settings || state.settings };
      paintMarks();
    }
  }

  function loginFormOf(el) {
    const group = groupOf(el);
    return fieldsIn(group).some((f) => kinds.get(f) === "password" || kinds.get(f) === "username");
  }

  function hostStyle(el, css) {
    for (const [k, v] of Object.entries(css)) el.style.setProperty(k, v, "important");
  }

  const BASE_CSS = ":host{all:initial}.w{width:100%;height:100%;border-radius:12px;overflow:hidden;background:transparent;box-shadow:0 2px 4px rgba(17,17,19,.05),0 12px 32px rgba(17,17,19,.16),0 0 0 1px rgba(17,17,19,.08);opacity:0;transform:translateY(-4px);transition:opacity .18s cubic-bezier(.16,1,.3,1),transform .18s cubic-bezier(.16,1,.3,1)}.w.on{opacity:1;transform:none}iframe{border:0;width:100%;height:100%;display:block;background:transparent}@media (prefers-color-scheme:dark){.w{box-shadow:0 12px 32px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1)}}@media (prefers-reduced-motion:reduce){.w{transition:none}}";

  function frameHost(tag, page, session, extraCss) {
    const host = document.createElement(tag);
    hostStyle(host, { all: "initial", position: "fixed", "z-index": "2147483647", display: "block", margin: "0", padding: "0", border: "0", width: "0px", height: "0px", left: "0px", top: "0px", overflow: "visible", visibility: "visible", opacity: "1", "pointer-events": "auto", "color-scheme": "normal" });
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = BASE_CSS + (extraCss || "");
    const wrap = document.createElement("div");
    wrap.className = "w";
    const iframe = document.createElement("iframe");
    iframe.setAttribute("allow", "clipboard-write");
    iframe.setAttribute("title", "APM");
    iframe.setAttribute("scrolling", "no");
    iframe.src = chrome.runtime.getURL(page) + "#" + session;
    wrap.appendChild(iframe);
    root.appendChild(style);
    root.appendChild(wrap);
    (document.documentElement || document.body).appendChild(host);
    return { host, wrap, iframe, root };
  }

  function placeMenu() {
    if (!menu) return;
    const r = menu.field.getBoundingClientRect();
    if (!r.width || !menu.field.isConnected) { closeMenu(); return; }
    const w = Math.min(menu.width || 328, window.innerWidth - 16);
    const h = menu.height || 0;
    let left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - 6 - h > 8) top = r.top - 6 - h;
    hostStyle(menu.host, { left: left + "px", top: top + "px", width: w + "px", height: h + "px" });
  }

  function closeMenu(tell) {
    if (!menu) return;
    const m = menu;
    menu = null;
    m.host.remove();
    if (tell !== false) send({ t: "cs:closed", session: m.session });
  }

  async function openMenu(field, kind, explicit) {
    if (!field || !field.isConnected) return;
    if (!explicit && dismissed.has(field)) return;
    if (menu && menu.field === field && menu.kind === kind) return;
    const r = await send({ t: "cs:menu", kind, explicit: !!explicit, loginForm: loginFormOf(field) });
    if (!r || !r.show || !r.session) return;
    if (document.activeElement !== field && !explicit) return;
    closeMenu();
    const f = frameHost("apm-menu", "inline.html", r.session);
    menu = Object.assign(f, { field, kind, session: r.session, height: 0, width: 328, nav: false });
    placeMenu();
  }

  function paintMarks() {
    const show = state.on && state.settings.fieldIcon;
    if (!show) { if (marks) { marks.host.remove(); marks = null; } return; }
    const fields = scanned.filter((el) => el.isConnected && kinds.has(el));
    if (!fields.length) { if (marks) { marks.host.remove(); marks = null; } return; }
    if (!marks) {
      const host = document.createElement("apm-marks");
      hostStyle(host, { all: "initial", position: "fixed", left: "0px", top: "0px", width: "0px", height: "0px", "z-index": "2147483646", display: "block", overflow: "visible", "pointer-events": "none" });
      const root = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = ":host{all:initial}button{position:fixed;width:20px;height:20px;padding:0;margin:0;border:0;border-radius:5px;background:#0b0b0d;box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 1px 2px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;opacity:.92;transition:opacity .12s ease,transform .12s ease}button:hover{opacity:1}button:active{transform:scale(.92)}button.locked{opacity:.5}button:focus-visible{outline:2px solid #5b8dff;outline-offset:2px}svg{width:13px;height:13px;display:block}@media (prefers-color-scheme:dark){button{background:#18181c;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 0 0 1px rgba(255,255,255,.1)}}";
      root.appendChild(style);
      (document.documentElement || document.body).appendChild(host);
      marks = { host, root, map: new Map() };
    }
    const keep = new Set(fields);
    for (const [el, btn] of marks.map) if (!keep.has(el)) { btn.remove(); marks.map.delete(el); }
    for (const el of fields) {
      let btn = marks.map.get(el);
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-label", "Open APM for this field");
        btn.innerHTML = MARK_SVG;
        btn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          dismissed.delete(el);
          el.focus({ preventScroll: true });
          const k = kinds.get(el);
          openMenu(el, k === "otp" ? "otp" : k === "newpw" ? "newpw" : "login", true);
        });
        marks.root.appendChild(btn);
        marks.map.set(el, btn);
      }
      btn.classList.toggle("locked", !state.unlocked);
    }
    placeMarks();
  }

  function placeMarks() {
    if (!marks) return;
    for (const [el, btn] of marks.map) {
      const r = el.getBoundingClientRect();
      const out = !r.width || r.bottom < 0 || r.top > window.innerHeight || !visible(el);
      if (out) { btn.style.display = "none"; continue; }
      btn.style.display = "flex";
      const size = r.height < 28 ? 16 : 20;
      btn.style.width = size + "px";
      btn.style.height = size + "px";
      btn.style.left = Math.round(r.right - size - Math.min(10, Math.max(6, (r.height - size) / 2))) + "px";
      btn.style.top = Math.round(r.top + (r.height - size) / 2) + "px";
    }
  }

  const MARK_SVG = '<svg viewBox="' + MARK.viewBox + '" aria-hidden="true"><defs><mask id="apm-eye" maskUnits="userSpaceOnUse" x="-700" y="-700" width="1400" height="1400"><rect x="-700" y="-700" width="1400" height="1400" fill="#fff"/><circle cx="' + MARK.eye[0] + '" cy="' + MARK.eye[1] + '" r="' + MARK.eye[2] + '" fill="#000"/></mask></defs><g transform="' + MARK.transform + '" mask="url(#apm-eye)" fill="#f2f2f2" stroke="#f2f2f2" stroke-width="12" stroke-linejoin="round"><path d="' + MARK.body + '"/>' + MARK.wings.map((d) => '<path d="' + d + '"/>').join("") + '</g></svg>';

  let rafPending = false;
  function onViewport() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      placeMarks();
      placeMenu();
    });
  }

  let quiet = false;

  function setValue(el, v) {
    quiet = true;
    try { el.focus({ preventScroll: true }); } catch (e) {} finally { quiet = false; }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Unidentified" }));
    if (desc && desc.set) desc.set.call(el, v); else el.value = v;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: v }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Unidentified" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try { el.animate([{ boxShadow: "0 0 0 3px rgba(29,92,245,.35)" }, { boxShadow: "0 0 0 3px rgba(29,92,245,0)" }], { duration: 900, easing: "cubic-bezier(.16,1,.3,1)" }); } catch (e) {}
  }

  function bestAnchor(want) {
    const active = document.activeElement;
    if (active && kinds.has(active)) return active;
    if (menu && menu.field.isConnected) return menu.field;
    if (lastContext && lastContext.isConnected && kinds.has(lastContext)) return lastContext;
    const order = want === "otp" ? ["otp"] : want === "newpw" ? ["newpw", "password"] : ["password", "username"];
    for (const k of order) {
      const el = scanned.find((x) => x.isConnected && kinds.get(x) === k && visible(x));
      if (el) return el;
    }
    return null;
  }

  function fillLogin(username, password) {
    rescanNow();
    const anchor = bestAnchor("login");
    if (!anchor) return { ok: false };
    const group = groupOf(anchor);
    const fields = fieldsIn(group);
    let pw = kinds.get(anchor) === "password" ? anchor : fields.find((f) => kinds.get(f) === "password") || null;
    let user = kinds.get(anchor) === "username" ? anchor : pw ? usernameFor(pw, fields) : fields.find((f) => kinds.get(f) === "username") || null;
    if (!pw && !user) return { ok: false };
    const filled = { username: false, password: false };
    if (user && username) { setValue(user, username); filled.username = true; }
    if (pw && password) { setValue(pw, password); filled.password = true; }
    if (pw && filled.password) { try { pw.focus({ preventScroll: true }); } catch (e) {} }
    return { ok: filled.username || filled.password, filled };
  }

  function fillOtp(code) {
    rescanNow();
    const anchor = bestAnchor("otp");
    if (!anchor) return { ok: false };
    if (anchor.maxLength === 1) {
      const parent = anchor.parentElement && anchor.parentElement.parentElement ? anchor.parentElement.parentElement : anchor.parentElement;
      const boxes = Array.from(parent.querySelectorAll("input")).filter((x) => x.maxLength === 1 && visible(x));
      String(code).split("").forEach((d, i) => { if (boxes[i]) setValue(boxes[i], d); });
      return { ok: true };
    }
    setValue(anchor, code);
    return { ok: true };
  }

  function fillPasswordField(value) {
    rescanNow();
    const anchor = bestAnchor("newpw");
    if (!anchor || anchor.type !== "password") {
      const any = scanned.find((x) => x.isConnected && (kinds.get(x) === "newpw"));
      if (!any) return { ok: false };
      return fillPasswordFrom(any, value);
    }
    return fillPasswordFrom(anchor, value);
  }

  function fillPasswordFrom(anchor, value) {
    const group = groupOf(anchor);
    const targets = fieldsIn(group).filter((f) => f.type === "password" && kinds.get(f) === "newpw");
    const list = targets.length ? targets : [anchor];
    list.forEach((f) => setValue(f, value));
    return { ok: true, count: list.length };
  }

  function rescanNow() {
    const { seen } = scan();
    scanned = seen;
  }

  function capture(group, how) {
    const fields = fieldsIn(group);
    const pws = fields.filter((f) => f.type === "password" && f.value);
    const userField = pws.length ? usernameFor(pws[0], fields) : fields.find((f) => kinds.get(f) === "username" && f.value);
    const username = userField && userField.value ? userField.value : "";
    if (!pws.length) {
      if (username && (kinds.get(userField) === "username")) sendSubmit({ username, password: "", how });
      return;
    }
    let password = pws[0].value;
    let change = false;
    let newPassword = false;
    if (pws.length >= 2) {
      const current = pws.find((f) => OLD_RE.test(hints(f)) || (f.getAttribute("autocomplete") || "").includes("current-password"));
      const fresh = pws.filter((f) => f !== current);
      if (current && fresh.length) { password = fresh[0].value; change = true; }
      else { password = fresh[fresh.length - 1].value; newPassword = true; }
    } else if (kinds.get(pws[0]) === "newpw") newPassword = true;
    sendSubmit({ username, password, change, newPassword, how });
  }

  function sendSubmit(d) {
    const key = d.username + "\u0000" + d.password;
    if (key === lastSubmit.key && Date.now() - lastSubmit.at < 1500) return;
    lastSubmit = { key, at: Date.now() };
    send(Object.assign({ t: "cs:submitted" }, d));
  }

  function mountPrompt(session, kind) {
    const corner = kind === "save" || kind === "update" || kind === "toast";
    const slot = corner ? (kind === "toast" ? "toast" : "note") : "sheet";
    if (prompts[slot]) prompts[slot].host.remove();
    const extra = corner ? "" : ".b{position:fixed;inset:0;background:rgba(9,9,11,.4);opacity:0;transition:opacity .2s ease}.b.on{opacity:1}@media (prefers-color-scheme:dark){.b{background:rgba(0,0,0,.6)}}.w{position:relative;border-radius:16px}";
    const f = frameHost(corner ? "apm-note" : "apm-sheet", "prompt.html", session, extra);
    const p = Object.assign(f, { session, kind, slot, height: 0, width: corner ? 360 : 400, corner });
    if (!corner) {
      const b = document.createElement("div");
      b.className = "b";
      f.root.insertBefore(b, f.wrap);
      p.backdrop = b;
      hostStyle(f.host, { left: "0px", top: "0px", width: "100vw", height: "100vh" });
    }
    prompts[slot] = p;
    placePrompt(p);
    return p;
  }

  function placePrompt(p) {
    const w = Math.min(p.width, window.innerWidth - 24);
    if (p.corner) {
      const top = p.slot === "toast" && prompts.note ? 12 + (prompts.note.height || 0) + 10 : 12;
      hostStyle(p.host, { left: Math.max(12, window.innerWidth - w - 12) + "px", top: top + "px", width: w + "px", height: (p.height || 0) + "px" });
    } else {
      p.wrap.style.width = w + "px";
      p.wrap.style.height = (p.height || 0) + "px";
      p.wrap.style.margin = Math.max(16, Math.min(72, window.innerHeight * 0.1)) + "px auto 0";
    }
  }

  function findPrompt(session) {
    return Object.values(prompts).find((p) => p && p.session === session) || null;
  }

  function dropPrompt(session) {
    for (const k of Object.keys(prompts)) {
      if (prompts[k] && prompts[k].session === session) {
        const p = prompts[k];
        prompts[k] = null;
        p.wrap.classList.remove("on");
        if (p.backdrop) p.backdrop.classList.remove("on");
        setTimeout(() => p.host.remove(), 180);
      }
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || sender.id !== chrome.runtime.id || typeof msg.t !== "string" || !msg.t.startsWith("bg:")) return;
    switch (msg.t) {
      case "bg:fill": { const r = fillLogin(msg.username, msg.password); respond(r); if (r.ok) closeMenu(false); return; }
      case "bg:fill-otp": { const r = fillOtp(msg.code); respond(r); if (r.ok) closeMenu(false); return; }
      case "bg:fill-password": { const r = fillPasswordField(msg.password); respond(r); if (r.ok) closeMenu(false); return; }
      case "bg:probe": {
        rescanNow();
        const u = scanned.find((x) => kinds.get(x) === "username" && x.value);
        respond({ ok: true, username: u ? u.value : "" });
        return;
      }
      case "bg:size": {
        if (menu && menu.session === msg.session) {
          menu.height = Math.max(0, Math.min(Number(msg.height) || 0, 560));
          if (msg.width) menu.width = Number(msg.width);
          placeMenu();
          if (menu.height) requestAnimationFrame(() => menu && menu.wrap.classList.add("on"));
        } else {
          const p = findPrompt(msg.session);
          if (p) {
            p.height = Math.max(0, Math.min(Number(msg.height) || 0, window.innerHeight - 24));
            placePrompt(p);
            if (p.slot === "note" && prompts.toast) placePrompt(prompts.toast);
            if (p.height) requestAnimationFrame(() => { p.wrap.classList.add("on"); if (p.backdrop) p.backdrop.classList.add("on"); });
          }
        }
        respond({ ok: true });
        return;
      }
      case "bg:close": {
        if (menu && menu.session === msg.session) closeMenu(false);
        dropPrompt(msg.session);
        respond({ ok: true });
        return;
      }
      case "bg:prompt": {
        if (!TOP) { respond({ ok: false }); return; }
        mountPrompt(msg.session, msg.kind);
        respond({ ok: true });
        return;
      }
      case "bg:open-menu": {
        const el = lastContext && lastContext.isConnected ? lastContext : document.activeElement;
        if (el instanceof HTMLInputElement) {
          dismissed.delete(el);
          openMenu(el, msg.kind, true);
        }
        respond({ ok: true });
        return;
      }
      case "bg:passkey-ready": {
        const el = document.activeElement;
        if (!menu && state.on && el instanceof HTMLInputElement && kinds.get(el) === "username" && !dismissed.has(el)) openMenu(el, "login", false);
        respond({ ok: true });
        return;
      }
      case "bg:settings": {
        state.settings = msg.settings || state.settings;
        state.on = state.on && !msg.paused;
        hello();
        respond({ ok: true });
        return;
      }
      case "bg:rehello": { rescan(true); respond({ ok: true }); return; }
      case "bg:state": {
        state.on = !!msg.on;
        state.unlocked = !!msg.unlocked;
        if (!state.on) closeMenu();
        paintMarks();
        respond({ ok: true });
        return;
      }
      default: respond({ ok: false });
    }
  });

  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (!kinds.has(el)) { rescanNow(); if (!kinds.has(el)) return; }
    lastContext = el;
    if (quiet) return;
    const k = kinds.get(el);
    send({ t: "cs:focus", kind: k });
    if (!state.on) return;
    openMenu(el, k === "otp" ? "otp" : k === "newpw" ? "newpw" : "login", false);
  }, true);

  document.addEventListener("focusout", (e) => {
    if (!menu || e.target !== menu.field) return;
    setTimeout(() => {
      if (!menu) return;
      const a = document.activeElement;
      if (a === menu.host || a === menu.field) return;
      closeMenu();
    }, 180);
  }, true);

  document.addEventListener("mousedown", (e) => {
    if (menu && e.target !== menu.host && e.target !== menu.field) closeMenu();
    if (e.target instanceof HTMLInputElement && e.target === document.activeElement && kinds.has(e.target) && !menu && state.on) {
      const k = kinds.get(e.target);
      dismissed.delete(e.target);
      setTimeout(() => openMenu(e.target, k === "otp" ? "otp" : k === "newpw" ? "newpw" : "login", false), 0);
    }
  }, true);

  document.addEventListener("contextmenu", (e) => { if (e.target instanceof HTMLInputElement) lastContext = e.target; }, true);

  document.addEventListener("keydown", (e) => {
    const el = e.target;
    if (menu && el === menu.field) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        menu.nav = true;
        send({ t: "cs:key", session: menu.session, key: e.key });
        return;
      }
      if (e.key === "Enter" && menu.nav) {
        e.preventDefault();
        e.stopPropagation();
        send({ t: "cs:key", session: menu.session, key: "Enter" });
        return;
      }
      if (e.key === "Escape") {
        dismissed.add(el);
        closeMenu();
        return;
      }
      if (e.key === "Tab") closeMenu();
      else if (e.key.length === 1 || e.key === "Backspace") { menu.nav = false; }
    }
    if (e.key === "Enter" && el instanceof HTMLInputElement && (el.type === "password" || kinds.has(el))) {
      const group = groupOf(el);
      setTimeout(() => capture(group, "enter"), 0);
    }
  }, true);

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form instanceof HTMLFormElement) capture(form, "submit");
  }, true);

  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target.closest("button,input[type=submit],input[type=button],[role=button],a") : null;
    if (!t) return;
    const text = (t.textContent || t.value || t.getAttribute("aria-label") || "").trim();
    const isSubmit = (t.type === "submit") || (t.tagName === "BUTTON" && !t.getAttribute("type") && t.closest("form")) || SUBMIT_RE.test(text);
    if (!isSubmit) return;
    const group = groupOf(t);
    if (!fieldsIn(group).some((f) => f.type === "password" && f.value) && !fieldsIn(group).some((f) => kinds.get(f) === "username" && f.value)) return;
    capture(group, "click");
  }, true);

  window.addEventListener("scroll", onViewport, true);
  window.addEventListener("resize", onViewport, true);

  const mo = new MutationObserver(() => rescan(false));
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "style", "class", "hidden", "autocomplete"] });

  rescan(true);
  setTimeout(() => rescan(false), 1200);
})();
