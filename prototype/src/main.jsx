import { A, cx } from "./util.jsx";
import { Popup } from "./popup.jsx";
import { Page } from "./page.jsx";
import { Options } from "./options.jsx";
import { SITE } from "./seed.js";

const OLD = "existing";
const NEW = "new";

const SCENES = [
  { group: "Toolbar popup", id: "site", label: "This site", icon: "globe", popup: { tab: "site" }, note: "What opens when you click the toolbar bird on harbor.dev. Matches first, each with Fill, copy and its live one-time code. Watchtower speaks up only about this site.", bridge: [["GET /api/status", NEW], ["GET /api/entries?site=harbor.dev", OLD], ["POST /api/fill", NEW], ["GET /api/totp/{id}", NEW]] },
  { group: "Toolbar popup", id: "detail", label: "Item detail", icon: "file-text", popup: { tab: "site", stack: [{ v: "detail", id: "harbor-me" }] }, note: "One item, the same field rows as the desktop app. Reveal, copy with a 30s clipboard countdown, strength, code, passkey and history dates.", bridge: [["GET /api/items/{id}", NEW], ["POST /api/items/{id}/reveal", NEW], ["POST /api/items/{id}/trash", NEW]] },
  { group: "Toolbar popup", id: "vault", label: "Vault", icon: "layers", popup: { tab: "vault" }, note: "Every item in the chosen space, grouped by recency, with a type filter. Press / to search.", bridge: [["GET /api/items?q=", NEW]] },
  { group: "Toolbar popup", id: "vault-empty", label: "Vault, no matches", icon: "search", popup: { tab: "vault", query: "linear" }, note: "Empty search says what it searched and offers the next step.", bridge: [["GET /api/items?q=linear", NEW]] },
  { group: "Toolbar popup", id: "codes", label: "Codes", icon: "timer", popup: { tab: "codes" }, note: "Every one-time code, live. Codes for the current site sit on top. Click a row to copy.", bridge: [["GET /api/totp", NEW]] },
  { group: "Toolbar popup", id: "gen", label: "Generator", icon: "dices", popup: { tab: "gen" }, note: "Same generator as the desktop app. Runs locally in the browser. Fill drops it into the focused password field.", bridge: [] },
  { group: "Toolbar popup", id: "new", label: "New login", icon: "plus", popup: { stack: [{ v: "new" }] }, note: "Prefilled from the page: name, website and the username you typed. A strong password is already generated.", bridge: [["POST /api/items", NEW]] },
  { group: "Toolbar popup", id: "capture", label: "Passkey waiting", icon: "bell", popup: { tab: "site", capture: true }, note: "A site created a passkey while the popup was closed. The badge on the toolbar icon turns blue and this callout waits at the top.", bridge: [["chrome.storage.session capture", OLD]] },
  { group: "Toolbar popup", id: "save-passkey", label: "Save passkey", icon: "fingerprint", popup: { capture: true, stack: [{ v: "save-passkey" }] }, note: "Pick the login a captured passkey belongs to. The login for the same site is suggested first.", bridge: [["POST /api/passkeys", OLD]] },
  { group: "Toolbar popup", id: "passkeys", label: "Passkeys", icon: "key-round", popup: { stack: [{ v: "passkeys" }] }, note: "Every passkey in the vault. Rename or remove inline, with a warning that the site still trusts a removed key.", bridge: [["GET /api/passkeys", OLD], ["POST /api/passkeys/rename", OLD], ["POST /api/passkeys/remove", OLD]] },
  { group: "Toolbar popup", id: "locked", label: "Locked", icon: "lock", popup: { gate: "locked" }, note: "The extension locks when APM locks. Type any password to unlock, or \"wrong\" to see the error. Touch ID hands off to the app.", bridge: [["POST /api/unlock", NEW], ["POST /api/unlock/touchid", NEW]] },
  { group: "Toolbar popup", id: "locked-error", label: "Wrong password", icon: "circle-alert", popup: { gate: "locked", error: true }, note: "Says what happened and how many attempts remain, with the same wording as the app.", bridge: [["POST /api/unlock → 401", NEW]] },
  { group: "Toolbar popup", id: "pair", label: "Connect", icon: "plug", popup: { gate: "pair" }, note: "First run. The extension found APM on the loopback port and asks for the pairing token once.", bridge: [["GET /api/info", OLD]] },
  { group: "Toolbar popup", id: "pair-error", label: "Connect, bad token", icon: "circle-x", popup: { gate: "pair", error: true }, note: "A rotated or mistyped token gets a specific answer.", bridge: [["GET /api/info → 401", OLD]] },
  { group: "Toolbar popup", id: "offline", label: "APM not running", icon: "power", popup: { gate: "offline" }, note: "Nothing answers on 127.0.0.1:41417. The extension says so plainly and waits.", bridge: [["GET /api/info → refused", OLD]] },
  { group: "On the page", id: "fill", label: "Fill a login", icon: "mouse-pointer-click", page: { overlay: "fill" }, note: "Focusing the email field opens the APM menu under it. Arrow keys move, Enter fills. Click a login to fill both fields.", bridge: [["GET /api/entries?site=harbor.dev", OLD], ["POST /api/fill", NEW]] },
  { group: "On the page", id: "locked-field", label: "Locked field", icon: "lock", page: { overlay: "locked", locked: true }, note: "When APM is locked the menu says so and points to the toolbar. The master password is never typed into a page.", bridge: [["GET /api/status", NEW]] },
  { group: "On the page", id: "otp", label: "One-time code", icon: "timer", page: { page: "otp", overlay: "otp" }, note: "On the two-factor page, the menu offers the code for the login you just filled.", bridge: [["GET /api/totp/{id}", NEW]] },
  { group: "On the page", id: "newpw", label: "New password", icon: "dices", page: { page: "signup", overlay: "newpw" }, note: "Sign-up forms get a strong password suggestion. Submit the form to see the save prompt.", bridge: [] },
  { group: "On the page", id: "save", label: "Save login", icon: "save", page: { overlay: "save" }, note: "After a sign-in APM has not seen, a prompt drops in from the top right. Name, username and space are editable.", bridge: [["POST /api/items", NEW]] },
  { group: "On the page", id: "update", label: "Update password", icon: "refresh-cw", page: { overlay: "update" }, note: "A known username with a new password. The old one stays in history.", bridge: [["PATCH /api/items/{id}", NEW]] },
  { group: "On the page", id: "pk-create", label: "Create a passkey", icon: "fingerprint", page: { overlay: "pk-create" }, note: "The site calls navigator.credentials.create. APM answers in the page and asks which login to keep it in.", bridge: [["POST /api/passkeys", OLD]] },
  { group: "On the page", id: "pk-get", label: "Sign in with a passkey", icon: "log-in", page: { overlay: "pk-get" }, note: "The site calls navigator.credentials.get. APM signs with the saved key and the page signs you in.", bridge: [["GET /api/credentials?rp=harbor.dev", OLD], ["POST /api/passkeys/use", OLD]] },
  { group: "Settings page", id: "options", label: "Extension settings", icon: "settings", options: true, note: "A full tab at chrome-extension://…/options.html. Connection, autofill, passkeys, security, shortcuts, excluded sites and permissions.", bridge: [["GET /api/info", OLD], ["GET /api/settings", NEW]] }
];

const GROUPS = ["Toolbar popup", "On the page", "Settings page"];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

function applyTheme(t) {
  const r = document.documentElement;
  if (t === "system") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t);
}

function useNarrow() {
  const q = "(max-width: 900px)";
  const [m, setM] = React.useState(() => window.matchMedia(q).matches);
  React.useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  return m;
}

function sceneFromHash() {
  const h = (location.hash || "").replace("#", "");
  return SCENES.find((s) => s.id === h) ? h : null;
}

function App() {
  const [sid, setSid] = React.useState(() => sceneFromHash() || store.get("apm-ext-scene") || "site");
  const [theme, setTheme] = React.useState(() => store.get("apm-ext-theme") || "system");
  const narrow = useNarrow();
  const scene = SCENES.find((s) => s.id === sid) || SCENES[0];
  React.useEffect(() => { applyTheme(theme); store.set("apm-ext-theme", theme); }, [theme]);
  React.useEffect(() => { store.set("apm-ext-scene", sid); try { history.replaceState(null, "", "#" + sid); } catch (e) {} }, [sid]);
  React.useEffect(() => { const f = () => { const h = sceneFromHash(); if (h) setSid(h); }; window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const themeCtl = <A.SegmentedControl label="Theme" value={theme} onChange={setTheme} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />;
  return (
    <div className={cx("proto", narrow && "is-narrow")}>
      {!narrow && (
        <aside className="rail">
          <div className="rail-brand"><A.Mark tile size={28} /><span><b>APM for Chrome</b><span className="caption muted">Extension prototype · v1.0</span></span></div>
          {GROUPS.map((g) => (
            <div className="rail-group" key={g}>
              <div className="rail-title">{g}</div>
              {SCENES.filter((s) => s.group === g).map((s) => <A.NavItem key={s.id} icon={s.icon} label={s.label} active={s.id === sid} onClick={() => setSid(s.id)} />)}
            </div>
          ))}
        </aside>
      )}
      <main className="stage">
        {narrow && (
          <div className="mtop">
            <A.Mark tile size={24} />
            <A.Select id="scene-pick" size="sm" value={sid} onChange={setSid} options={SCENES.map((s) => ({ value: s.id, label: s.group + " · " + s.label }))} />
          </div>
        )}
        <div className="stage-top">
          <div className="stage-text">
            <div className="rail-title flush">{scene.group}</div>
            <h1 className="title-2">{scene.label}</h1>
            <p className="small stage-note">{scene.note}</p>
          </div>
          {themeCtl}
        </div>
        {narrow ? <Solo key={sid} scene={scene} /> : <Browser key={sid} scene={scene} />}
        <div className="stage-bridge">
          <span className="rail-title flush">Bridge</span>
          {scene.bridge.length ? scene.bridge.map(([r, k]) => <span key={r} className={cx("route", k === NEW && "is-new")} title={k === NEW ? "New route for the bridge" : "Already in desktop_bridge.go"}>{r}</span>) : <span className="caption muted">None. This runs entirely in the extension.</span>}
          <span className="legend"><span className="route">existing</span><span className="route is-new">new</span></span>
        </div>
      </main>
    </div>
  );
}

function Browser({ scene }) {
  const [open, setOpen] = React.useState(!!scene.popup);
  const [filled, setFilled] = React.useState(null);
  const [pageToast, setPageToast] = React.useState(null);
  const pageScene = scene.page || {};
  const locked = scene.popup && (scene.popup.gate === "locked") || pageScene.locked;
  const pending = scene.popup && scene.popup.capture;
  const path = scene.options ? null : pageScene.page === "otp" ? "/session/two-factor" : pageScene.page === "signup" ? "/signup" : SITE.path;
  return (
    <div className="browser">
      <div className="br-tabs">
        <span className="lights" aria-hidden="true"><i /><i /><i /></span>
        <div className="br-tab is-on">{scene.options ? <A.Mark size={14} /> : <span className="br-fav">H</span>}<span className="br-tab-t">{scene.options ? "APM for Chrome · Settings" : "Harbor · Sign in"}</span><A.Icon name="x" size={12} /></div>
        <div className="br-tab"><span className="br-fav is-2">N</span><span className="br-tab-t">Northwind status</span></div>
      </div>
      <div className="br-bar">
        <span className="br-ic"><A.Icon name="arrow-left" size={16} /></span>
        <span className="br-ic"><A.Icon name="arrow-right" size={16} /></span>
        <span className="br-ic"><A.Icon name="rotate-cw" size={15} /></span>
        <div className="omni">{scene.options ? <><A.Icon name="puzzle" size={13} /><span>chrome-extension://apm/<b>options.html</b></span></> : <><A.Icon name="lock" size={13} /><span><b>{SITE.host}</b>{path}</span></>}</div>
        <div className="br-ext">
          <button type="button" className={cx("ext-btn", open && "is-on")} aria-label="APM" aria-expanded={open} onClick={() => setOpen(!open)} disabled={scene.options}>
            <A.Mark tile size={20} />
            {locked ? <span className="ext-badge is-locked"><A.Icon name="lock" size={8} strokeWidth={3} /></span> : pending ? <span className="ext-badge is-pending">1</span> : !scene.options && <span className="ext-badge">3</span>}
          </button>
          <span className="br-ic"><A.Icon name="puzzle" size={16} /></span>
          <A.Avatar name="Aarav Maloo" size={24} />
        </div>
      </div>
      <div className="br-page">
        {scene.options ? <Options /> : <Page scene={pageScene} filled={filled} setFilled={setFilled} pageToast={pageToast} setPageToast={setPageToast} />}
        {open && <div className="br-scrim" onClick={() => setOpen(false)} />}
      </div>
      {open && scene.popup && <div className="br-popup"><Popup scene={scene.popup} onFill={(it) => { setFilled(it); }} /></div>}
      {open && !scene.popup && <div className="br-popup"><Popup scene={{ tab: "site" }} onFill={(it) => { setFilled(it); }} /></div>}
    </div>
  );
}

function Solo({ scene }) {
  const [filled, setFilled] = React.useState(null);
  const [pageToast, setPageToast] = React.useState(null);
  if (scene.options) return <div className="solo-frame is-options"><Options narrow /></div>;
  if (scene.popup) return <div className="solo"><Popup scene={scene.popup} onFill={setFilled} /></div>;
  return <div className="solo-frame"><Page scene={scene.page} filled={filled} setFilled={setFilled} pageToast={pageToast} setPageToast={setPageToast} /></div>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
