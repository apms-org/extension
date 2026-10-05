import { A, cx, n, ToastHost, useToast, errorText, spaceLabel } from "../common/kit.jsx";
import { send } from "../common/rpc.js";
import { PairFlow } from "../popup/gate.jsx";
import { agoLong } from "../../shared/time.js";
import { RULES, PORT, LINK_CMD } from "../../shared/settings.js";

const SECTIONS = [
  { id: "connection", label: "Connection", icon: "plug" },
  { id: "autofill", label: "Autofill", icon: "mouse-pointer-click" },
  { id: "passkeys", label: "Passkeys", icon: "fingerprint" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "shortcuts", label: "Shortcuts", icon: "keyboard" },
  { id: "sites", label: "Excluded sites", icon: "shield-off" },
  { id: "about", label: "About", icon: "info" }
];

const Ctx = React.createContext(null);
const useOpt = () => React.useContext(Ctx);

function useNarrow() {
  const q = "(max-width: 720px)";
  const [v, setV] = React.useState(() => window.matchMedia(q).matches);
  React.useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setV(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return v;
}

function sectionFromHash() {
  const h = (location.hash || "").replace(/^#/, "");
  return SECTIONS.some((s) => s.id === h) ? h : "connection";
}

function App() {
  const [sec, setSecState] = React.useState(sectionFromHash);
  const [welcome, setWelcome] = React.useState(() => location.hash === "#welcome");
  const [st, setSt] = React.useState(null);
  const [settings, setSettingsState] = React.useState(null);
  const [conn, setConn] = React.useState(null);
  const [pairing, setPairing] = React.useState(null);
  const narrow = useNarrow();

  const load = React.useCallback(async (force) => {
    const [a, b, c, d] = await Promise.all([send("status", { force: !!force }), send("settings:get"), send("conn:info"), send("pair:state")]);
    if (a.ok) setSt(a.status);
    if (b.ok) setSettingsState(b.settings);
    if (c.ok) setConn(c);
    setPairing(d && d.ok && d.status !== "none" ? d : null);
  }, []);

  React.useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), 4000);
    const onHash = () => setSecState(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => { clearInterval(id); window.removeEventListener("hashchange", onHash); };
  }, [load]);

  const setSec = (s) => {
    setSecState(s);
    setWelcome(false);
    try { history.replaceState(null, "", "#" + s); } catch (e) {}
  };

  const patch = async (p) => {
    setSettingsState((s) => Object.assign({}, s, p));
    const r = await send("settings:set", { patch: p });
    if (r.ok) setSettingsState(r.settings);
    return r;
  };

  if (!st || !settings) return <div className="opt-boot"><A.Mark tile size={40} className="boot-mark" /></div>;
  const live = st.paired && st.reachable;
  return (
    <Ctx.Provider value={{ st, settings, patch, conn, pairing, reload: load }}>
      <ToastHost className="opt-toasts">
        <div className={cx("opt", narrow && "is-narrow")}>
          <aside className="opt-side">
            <div className="opt-brand"><A.Mark tile size={28} /><span><b>APM for Chrome</b><span className="mono-small muted">v{chrome.runtime.getManifest().version}</span></span></div>
            {narrow ? (
              <A.Select id="opt-sec" size="sm" label="Section" value={sec} onChange={setSec} options={SECTIONS.map((x) => ({ value: x.id, label: x.label }))} />
            ) : (
              <nav className="opt-nav" aria-label="Settings">
                {SECTIONS.map((x) => <A.NavItem key={x.id} icon={x.icon} label={x.label} active={sec === x.id} onClick={() => setSec(x.id)} badge={x.id === "connection" ? (live ? { tone: "success", text: st.unlocked ? "Live" : "Locked" } : { tone: "warning", text: st.paired ? "Offline" : "Not paired" }) : null} />)}
              </nav>
            )}
          </aside>
          <main className="opt-main">
            {welcome && <Welcome onClose={() => setWelcome(false)} />}
            {sec === "connection" && <Connection />}
            {sec === "autofill" && <Autofill />}
            {sec === "passkeys" && <PasskeySettings />}
            {sec === "security" && <Security />}
            {sec === "shortcuts" && <Shortcuts />}
            {sec === "sites" && <Sites />}
            {sec === "about" && <About />}
          </main>
        </div>
      </ToastHost>
    </Ctx.Provider>
  );
}

function Head({ title, children }) {
  return <div className="opt-head"><h1 className="title-1">{title}</h1>{children && <p className="small muted">{children}</p>}</div>;
}

function Group({ title, children, foot }) {
  return (
    <section className="opt-group">
      {title && <div className="opt-group-title">{title}</div>}
      <A.FieldGroup>{children}</A.FieldGroup>
      {foot && <p className="opt-group-foot caption">{foot}</p>}
    </section>
  );
}

function Toggle({ k, title, description, disabled, invert }) {
  const { settings, patch } = useOpt();
  const v = invert ? !settings[k] : !!settings[k];
  return <A.SettingRow title={title} description={description}><A.Switch checked={v} onChange={(x) => patch({ [k]: invert ? !x : x })} label={title} disabled={disabled} /></A.SettingRow>;
}

function Welcome({ onClose }) {
  const { st } = useOpt();
  const done = st.paired && st.reachable;
  return (
    <div className="welcome">
      <div className="welcome-top">
        <A.Mark tile size={44} />
        <div className="welcome-text">
          <h1 className="title-1">{done ? "APM is ready in Chrome" : "Welcome to APM for Chrome"}</h1>
          <p className="small muted">{done ? "This browser is paired with APM. Click the APM icon in the toolbar, or focus a login field on any site." : "The extension fills from your vault through the APM app, or through pm when the app is closed. Open the app, or link this browser once, and it connects by itself."}</p>
        </div>
      </div>
      <ol className="steps welcome-steps">
        <li className={cx(st.reachable && "is-done")}><span className="step-n">{st.reachable ? <A.Icon name="check" size={12} strokeWidth={2.5} /> : "1"}</span><span>Open the APM app, or run this once in a terminal so the browser can start pm without the app:</span></li>
        {!st.reachable && <li className="steps-cmd"><A.Command block cmd={LINK_CMD} label="Copy the command" /></li>}
        <li className={cx(st.paired && "is-done")}><span className="step-n">{st.paired ? <A.Icon name="check" size={12} strokeWidth={2.5} /> : "2"}</span><span>The extension pairs itself. Check the code, then choose <b>Connect</b> in the app or answer <b>y</b> in the terminal.</span></li>
        <li className={cx(st.unlocked && "is-done")}><span className="step-n">{st.unlocked ? <A.Icon name="check" size={12} strokeWidth={2.5} /> : "3"}</span><span>Pin APM to the toolbar from the puzzle icon, and unlock your vault.</span></li>
      </ol>
      <div className="welcome-foot"><A.Button size="sm" variant={done ? "primary" : "ghost"} onClick={onClose}>{done ? "Done" : "Hide"}</A.Button></div>
    </div>
  );
}

function Connection() {
  const { st, conn, pairing, reload } = useOpt();
  const push = useToast();
  const [forget, setForget] = React.useState(false);
  const [info, setInfo] = React.useState(null);
  const [portEdit, setPortEdit] = React.useState(false);
  const [portV, setPortV] = React.useState("");
  const [manual, setManual] = React.useState(false);
  React.useEffect(() => { send("bridge:info").then((r) => setInfo(r.ok ? r : null)); }, [st.reachable]);
  const port = conn ? conn.port : PORT;
  const doForget = async () => {
    await send("pair:forget");
    setForget(false);
    push({ title: "Forgot this browser", description: "APM pairs again next time it is running.", tone: "neutral", icon: "unlink" });
    reload(true);
  };
  const savePort = async (e) => {
    e.preventDefault();
    const r = await send("conn:port", { port: portV || PORT });
    if (r.ok) { setPortEdit(false); push({ title: "Looking for APM on port " + r.port, tone: "neutral" }); reload(true); }
  };
  const vaultLabel = !st.paired ? "Not paired" : !st.reachable ? "Unreachable" : st.exists === false ? "No vault yet" : st.unlocked ? "Unlocked" : "Locked";
  return (
    <>
      <Head title="Connection">The extension cannot decrypt anything on its own. It asks the APM app on this computer, or pm when the app is closed, and that holds the key while the vault is unlocked.</Head>
      <div className="bridge">
        <div className="bridge-node"><span className="bridge-ic"><A.Icon name="globe" size={16} /></span><b>Chrome</b><span className="caption muted">This extension</span></div>
        <div className={cx("bridge-wire", st.paired && st.reachable && "is-live")}><i /><span className="mono-small">{st.paired ? "paired" : "not paired"}</span></div>
        <div className="bridge-node"><span className="bridge-ic is-app"><A.Mark size={18} /></span><b>{st.reachable && st.via === "native" ? "pm" : "APM"}</b><span className={cx("caption", st.reachable ? (st.unlocked ? "status-ok" : "muted") : "status-warn")}>{st.reachable && st.unlocked && <span className="live-dot" />}{st.reachable ? vaultLabel : "Not running"}</span></div>
        <div className={cx("bridge-wire", st.unlocked && "is-live")}><i /><span className="mono-small">decrypts</span></div>
        <div className="bridge-node"><span className="bridge-ic"><A.Icon name="file-lock-2" size={16} /></span><b>vault.dat</b><span className="caption muted">{st.unlocked ? n(st.items || 0, "item") : "Encrypted"}</span></div>
      </div>
      {!st.paired ? (
        <Group title="Pair this browser">
          <div className="opt-pair">
            <PairFlow compact rejected={st.rejected} reachable={st.reachable} via={st.via} initial={pairing} onDone={() => { reload(true); push({ title: "Connected to APM" }); }} />
          </div>
        </Group>
      ) : (
        <Group>
          <A.SettingRow title={st.reachable && st.via === "native" ? "pm" : "APM app"} description={!st.reachable ? "Open the APM app, or run pm extension link once." : st.via === "native" ? "The app is closed, so the browser started pm" + (info && info.version ? " " + info.version : "") + " for you." : info && info.version ? "APM " + info.version + " on this computer" : "Running on this computer"}>
            {st.reachable ? <A.Badge tone="success" icon="circle-check">Connected</A.Badge> : <A.Badge tone="warning" icon="circle-alert">Not connected</A.Badge>}
          </A.SettingRow>
          <A.SettingRow title="Pairing" description={(conn && conn.pairedAt ? "Paired " + agoLong(conn.pairedAt) + " as " : "Paired as ") + (conn ? conn.client : "this browser") + ". Rotating the token in APM disconnects this browser, and it pairs again by itself."}>
            <A.Button size="sm" variant="secondary" icon="key-round" onClick={() => setManual(!manual)}>{manual ? "Close" : "Use a token"}</A.Button>
          </A.SettingRow>
          {manual && <div className="opt-pair"><ManualToken onDone={() => { setManual(false); reload(true); push({ title: "Connected with the new token" }); }} /></div>}
        </Group>
      )}
      <Group title="Without the app" foot="pm only answers this extension, and only after you confirm the code once. It holds the key while the vault is unlocked and locks on the vault's auto-lock settings. pm extension unlink undoes it.">
        <A.SettingRow title="Browser starts pm" description={st.linked === true ? "Linked. When the APM app is closed, the browser starts pm on its own." : st.linked === false ? "Not linked yet. Run the command below once in a terminal." : "Run the command below once to let the browser start pm when the app is closed."}>
          {st.linked === true ? <A.Badge tone="success" icon="circle-check">Linked</A.Badge> : st.linked === false ? <A.Badge icon="unlink">Not linked</A.Badge> : null}
        </A.SettingRow>
        <div className="opt-link"><A.Command block cmd={LINK_CMD} label="Copy the command" /></div>
      </Group>
      <Group title="Bridge" foot="Loopback only. Nothing outside this computer can reach it. Change the port only if you started APM with APM_BRIDGE_PORT.">
        <A.SettingRow title="Address" description="Where the extension looks for APM.">
          {portEdit ? (
            <form className="port-form" onSubmit={savePort}>
              <A.Input id="port" size="sm" className="mono-input port-input" value={portV} onChange={(e) => setPortV(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))} placeholder={String(PORT)} autoFocus aria-label="Port" />
              <A.Button size="sm" variant="primary" type="submit">Save</A.Button>
              <A.Button size="sm" variant="ghost" onClick={() => setPortEdit(false)}>Cancel</A.Button>
            </form>
          ) : (
            <span className="port-row"><span className="mono">127.0.0.1:{port}</span><A.IconButton icon="pencil" label="Change port" size="xs" onClick={() => { setPortV(String(port)); setPortEdit(true); }} /></span>
          )}
        </A.SettingRow>
        <A.SettingRow title="Extension ID" description="Pinned by the build, so it is the same on every computer."><span className="mono-small muted">{conn ? conn.id : ""}</span></A.SettingRow>
      </Group>
      {st.paired && (
        <Group title="Danger zone">
          <A.SettingRow danger title="Forget this browser" description="Removes the pairing token from Chrome. Your vault is not touched."><A.Button size="sm" variant="danger" onClick={() => setForget(true)}>Forget</A.Button></A.SettingRow>
        </Group>
      )}
      <A.Dialog open={forget} onClose={() => setForget(false)} title="Forget this browser?" icon="unlink" tone="danger" size="sm" footer={<><A.Button variant="ghost" onClick={() => setForget(false)}>Cancel</A.Button><A.Button variant="danger" onClick={doForget}>Forget</A.Button></>}>
        Chrome stops filling from APM until it pairs again. With the APM app running, that happens on its own. Without it, run pm extension link and confirm the code.
      </A.Dialog>
    </>
  );
}

function ManualToken({ onDone }) {
  const [tok, setTok] = React.useState("");
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await send("pair:token", { token: tok });
    setBusy(false);
    if (!r.ok) { setErr(errorText(r)); return; }
    onDone();
  };
  return (
    <form className="pair-body" onSubmit={submit}>
      <A.Input id="opt-token" label="Pairing token" placeholder="64 letters and digits" value={tok} onChange={(e) => { setTok(e.target.value); setErr(null); }} invalid={!!err} hint={err || "In a terminal, pm extension token --show prints it. In APM, open Settings, then Browser extension."} hintTone={err ? "danger" : undefined} className="mono-input" autoComplete="off" spellCheck={false} autoFocus />
      <A.Button variant="primary" type="submit" loading={busy} disabled={!tok.trim()}>Connect</A.Button>
    </form>
  );
}

function Autofill() {
  const { settings, patch, st } = useOpt();
  const spaces = [""].concat((st.spaces || []).map((s) => s.name).filter(Boolean));
  const saveOpts = spaces.map((s) => ({ value: s, label: spaceLabel(s) }));
  if (settings.saveSpace && !spaces.includes(settings.saveSpace)) saveOpts.push({ value: settings.saveSpace, label: settings.saveSpace });
  return (
    <>
      <Head title="Autofill">How APM helps on sign-in and sign-up forms.</Head>
      <Group title="On the page">
        <Toggle k="inlineMenu" title="Show the APM menu on login fields" description="Opens when you focus a username, password or one-time code field." />
        <Toggle k="fieldIcon" title="Show the APM icon inside fields" description="A small bird at the right edge of fields APM can fill." />
        <Toggle k="suggestPasswords" title="Suggest strong passwords on sign-up forms" description="Uses the generator settings from the toolbar popup." />
        <Toggle k="fillTotpAfterLogin" title="Copy the one-time code after a login" description="When the login has a code, APM copies it so the next page can take it." />
      </Group>
      <Group title="Saving">
        <Toggle k="offerSave" title="Offer to save new logins" />
        <Toggle k="offerUpdate" title="Offer to update changed passwords" description="The old password stays in the item's history." />
        <A.SettingRow title="Save new logins to" description={st.unlocked ? "You can change the space in each prompt." : "Unlock APM to see your spaces."}>
          <A.Select id="save-space" size="sm" value={settings.saveSpace || ""} onChange={(v) => patch({ saveSpace: v })} options={saveOpts} />
        </A.SettingRow>
      </Group>
      <Group title="Matching" foot="Base domain treats app.harbor.dev and harbor.dev as the same site. Exact host keeps them apart.">
        <A.SettingRow title="Match websites by">
          <A.Select id="match" size="sm" value={settings.matchMode} onChange={(v) => patch({ matchMode: v })} options={[{ value: "domain", label: "Base domain" }, { value: "host", label: "Exact host" }, { value: "prefix", label: "Starts with URL" }]} />
        </A.SettingRow>
      </Group>
    </>
  );
}

function PasskeySettings() {
  const { settings, st } = useOpt();
  const [count, setCount] = React.useState(null);
  React.useEffect(() => {
    if (!st.unlocked) { setCount(null); return; }
    send("passkeys:list").then((r) => setCount(r.ok ? (r.passkeys || []).length : null));
  }, [st.unlocked]);
  return (
    <>
      <Head title="Passkeys">APM answers passkey requests inside the page, so Chrome's own passkey sheet never opens for sites APM handles.</Head>
      <Group>
        <Toggle k="passkeys" title="Use APM for passkeys" description={"Create and sign with passkeys stored in your vault." + (count != null ? " " + n(count, "passkey") + " saved." : "")} />
        <Toggle k="passkeysInMenu" title="Offer passkeys in the login menu" description="When a site supports passkey autofill, they show under your logins." disabled={!settings.passkeys} />
      </Group>
      <A.Callout tone="neutral" icon="info" title="When Chrome takes over">Sites that accept only RS256 keys go to Chrome's own flow, and you can always choose Use this browser instead in the APM sheet. Nothing breaks, APM just steps aside.</A.Callout>
      <A.Callout tone="neutral" icon="shield-check" title="Private keys stay in APM">The extension never sees a private key. APM creates and signs with them, and the extension checks that each request comes from the site it names.</A.Callout>
    </>
  );
}

function Security() {
  const { st } = useOpt();
  const clip = st.settings && st.settings.clipboard;
  return (
    <>
      <Head title="Security">These follow your APM settings where they overlap.</Head>
      <Group>
        <A.SettingRow title="Clear the clipboard after" description="Set in APM. Applies to passwords, keys and codes copied from the extension."><span className="mono">{clip ? (clip === "0" || clip === "never" ? "Never" : clip + "s") : st.unlocked ? "30s" : "Unlock to see"}</span></A.SettingRow>
        <A.SettingRow title="Lock with APM" description="The extension locks the moment APM locks. This cannot be turned off."><A.Badge tone="neutral" icon="lock">Always</A.Badge></A.SettingRow>
        <Toggle k="lockOnClose" title="Lock APM when Chrome closes" description="Locks the vault when the last Chrome window closes." />
        <Toggle k="neverHttp" title="Never fill on http:// pages" description="Unencrypted pages can be read on the network. Localhost is always allowed." />
        <Toggle k="crossFrames" title="Fill inside frames from other sites" description="Off by default. A frame from another site could be hidden over the real form." />
      </Group>
    </>
  );
}

const CMD_LABELS = {
  _execute_action: "Open APM",
  "fill-login": "Fill the best login for this page",
  "generate-password": "Generate and fill a password",
  "copy-code": "Copy the one-time code for this page",
  "lock-vault": "Lock vault"
};

function keysOf(shortcut) {
  if (!shortcut) return null;
  const map = { Alt: "⌥", Option: "⌥", Shift: "⇧", Command: "⌘", MacCtrl: "⌃", Ctrl: navigator.platform.includes("Mac") ? "⌘" : "Ctrl" };
  const mac = /Mac/.test(navigator.platform);
  if (!mac) return shortcut.split("+");
  if (/^[⌥⇧⌘⌃]+[^⌥⇧⌘⌃]+$/.test(shortcut)) return Array.from(shortcut.replace(/[^⌥⇧⌘⌃]/g, "")).concat([shortcut.replace(/[⌥⇧⌘⌃]/g, "")]);
  return shortcut.split("+").map((k) => map[k] || k);
}

function Shortcuts() {
  const [cmds, setCmds] = React.useState(null);
  React.useEffect(() => { send("commands").then((r) => setCmds(r.ok ? r.commands : [])); }, []);
  const order = Object.keys(CMD_LABELS);
  const rows = (cmds || []).filter((c) => CMD_LABELS[c.name]).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return (
    <>
      <Head title="Shortcuts">Chrome owns extension shortcuts. Change or add them on Chrome's shortcuts page.</Head>
      <Group foot={<button type="button" className="linkbtn" onClick={() => send("open:shortcuts")}>Change shortcuts in Chrome</button>}>
        {cmds == null ? <A.SettingRow title="Loading" /> : rows.map((c) => {
          const k = keysOf(c.shortcut);
          return <A.SettingRow key={c.name} title={CMD_LABELS[c.name]}>{k ? <A.Kbd keys={k} /> : <span className="caption muted">Not set</span>}</A.SettingRow>;
        })}
      </Group>
      <Group title="In the APM menu on a page">
        <A.SettingRow title="Move between logins"><A.Kbd keys={["↑", "↓"]} /></A.SettingRow>
        <A.SettingRow title="Fill the highlighted login"><A.Kbd keys={["↵"]} /></A.SettingRow>
        <A.SettingRow title="Close the menu"><A.Kbd keys={["Esc"]} /></A.SettingRow>
      </Group>
      <Group title="Right-click menu">
        <A.SettingRow title="Fill a login, a one-time code or a strong password" description="Right-click any text field and choose APM." />
      </Group>
    </>
  );
}

function cleanHost(v) {
  let h = String(v || "").trim().toLowerCase();
  if (!h) return "";
  try { if (/^[a-z]+:\/\//.test(h)) h = new URL(h).hostname; } catch (e) { return ""; }
  h = h.replace(/^\*\./, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  return /^[a-z0-9.-]+\.[a-z0-9-]+$|^localhost$/.test(h) ? h : "";
}

function Sites() {
  const push = useToast();
  const [rows, setRows] = React.useState(null);
  const [host, setHost] = React.useState("");
  const [rule, setRule] = React.useState("both");
  const [err, setErr] = React.useState(null);
  React.useEffect(() => { send("excluded:get").then((r) => setRows(r.ok ? r.list : [])); }, []);
  const save = async (list) => {
    const r = await send("excluded:set", { list });
    if (r.ok) setRows(r.list);
    return r;
  };
  const add = async (e) => {
    e.preventDefault();
    const h = cleanHost(host);
    if (!h) { setErr("Enter a site like example.com."); return; }
    await save([{ host: h, rule }].concat(rows.filter((x) => x.host !== h)));
    setHost("");
    setErr(null);
  };
  const remove = async (r) => {
    await save(rows.filter((x) => x.host !== r.host));
    push({ title: "APM is back on " + r.host, tone: "neutral", icon: "power" });
  };
  if (rows == null) return <Head title="Excluded sites" />;
  return (
    <>
      <Head title="Excluded sites">APM stays quiet on these sites and every subdomain under them.</Head>
      <form className="site-add" onSubmit={add}>
        <A.Input id="ex-host" size="sm" placeholder="example.com" icon="globe" value={host} onChange={(e) => { setHost(e.target.value); setErr(null); }} invalid={!!err} aria-label="Site" />
        <A.Select id="ex-rule" size="sm" value={rule} onChange={setRule} options={Object.entries(RULES).map(([value, label]) => ({ value, label }))} />
        <A.Button size="sm" variant="secondary" type="submit" icon="plus">Add</A.Button>
      </form>
      {err && <p className="caption np-err"><A.Icon name="circle-alert" size={14} />{err}</p>}
      {rows.length > 0 ? (
        <Group>
          {rows.map((r) => (
            <A.SettingRow key={r.host} title={<span className="mono">{r.host}</span>} description={RULES[r.rule] || RULES.both}>
              <span className="site-actions">
                <A.Select id={"rule-" + r.host} size="sm" value={r.rule} onChange={(v) => save(rows.map((x) => (x.host === r.host ? { host: x.host, rule: v } : x)))} options={Object.entries(RULES).map(([value, label]) => ({ value, label }))} />
                <A.IconButton icon="trash-2" label={"Remove " + r.host} size="sm" onClick={() => remove(r)} />
              </span>
            </A.SettingRow>
          ))}
        </Group>
      ) : (
        <A.EmptyState icon="shield-off" title="No excluded sites">Add a site here, choose Pause APM on this site in the toolbar popup, or choose Never in a save prompt.</A.EmptyState>
      )}
    </>
  );
}

function About() {
  const { st, conn } = useOpt();
  const perms = [
    ["storage", "Keeps the pairing token, your extension settings and excluded sites."],
    ["activeTab", "Lets the toolbar popup and shortcuts work on the page you are on."],
    ["contextMenus", "Adds APM to the right-click menu on text fields."],
    ["offscreen, clipboardWrite, clipboardRead", "Copies secrets and clears the clipboard later, only if it still holds what APM copied."],
    ["alarms", "Checks once a minute whether APM is running and locked."],
    ["All sites", "Finds login forms so APM can fill them. Nothing on the page is sent anywhere but the APM app."],
    ["127.0.0.1", "Talks to the APM app on this computer. No other host is contacted."]
  ];
  return (
    <>
      <Head title="About" />
      <Group>
        <A.SettingRow title="Extension"><span className="mono">{chrome.runtime.getManifest().version}</span></A.SettingRow>
        <A.SettingRow title="APM app"><span className="mono">{st.reachable && st.version ? st.version : "Not connected"}</span></A.SettingRow>
        <A.SettingRow title="This browser"><span className="mono-small">{conn ? conn.client : ""}</span></A.SettingRow>
        <A.SettingRow title="Vault encryption"><span className="mono">XChaCha20-Poly1305 · Argon2id</span></A.SettingRow>
      </Group>
      <Group title="Permissions" foot="Website logos are fetched by the APM app from each site itself and cached on this computer. The extension never sends analytics or calls a server of its own.">
        {perms.map(([p, d]) => <A.SettingRow key={p} title={<span className="mono">{p}</span>} description={d} />)}
      </Group>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
