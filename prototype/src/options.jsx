import { A, cx } from "./util.jsx";
import { EXCLUDED, VAULT_META, ITEMS } from "./seed.js";

const SECTIONS = [
  { id: "connection", label: "Connection", icon: "plug" },
  { id: "autofill", label: "Autofill", icon: "mouse-pointer-click" },
  { id: "passkeys", label: "Passkeys", icon: "fingerprint" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "shortcuts", label: "Shortcuts", icon: "keyboard" },
  { id: "sites", label: "Excluded sites", icon: "shield-off" },
  { id: "about", label: "About", icon: "info" }
];

export function Options({ section: s0, narrow }) {
  const [sec, setSec] = React.useState(s0 || "connection");
  return (
    <div className={cx("opt", narrow && "is-narrow")}>
      <aside className="opt-side">
        <div className="opt-brand"><A.Mark tile size={28} /><span><b>APM for Chrome</b><span className="mono-small muted">v{VAULT_META.ext}</span></span></div>
        {narrow ? (
          <A.Select id="opt-sec" size="sm" label="Section" value={sec} onChange={setSec} options={SECTIONS.map((x) => ({ value: x.id, label: x.label }))} />
        ) : (
          <nav className="opt-nav">
            {SECTIONS.map((x) => <A.NavItem key={x.id} icon={x.icon} label={x.label} active={sec === x.id} onClick={() => setSec(x.id)} badge={x.id === "connection" ? { tone: "success", text: "Live" } : null} />)}
          </nav>
        )}
      </aside>
      <main className="opt-main">
        {sec === "connection" && <Connection />}
        {sec === "autofill" && <Autofill />}
        {sec === "passkeys" && <PasskeySettings />}
        {sec === "security" && <Security />}
        {sec === "shortcuts" && <Shortcuts />}
        {sec === "sites" && <Sites />}
        {sec === "about" && <About />}
      </main>
    </div>
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

function Toggle({ title, description, on = true, disabled }) {
  const [v, setV] = React.useState(on);
  return <A.SettingRow title={title} description={description}><A.Switch checked={v} onChange={setV} label={title} disabled={disabled} /></A.SettingRow>;
}

function Connection() {
  const [forget, setForget] = React.useState(false);
  return (
    <>
      <Head title="Connection">The extension cannot decrypt anything on its own. It asks the APM app on this computer, which holds the key while the vault is unlocked.</Head>
      <div className="bridge">
        <div className="bridge-node"><span className="bridge-ic"><A.Icon name="globe" size={16} /></span><b>Chrome</b><span className="caption muted">This extension</span></div>
        <div className="bridge-wire is-live"><i /><span className="mono-small">bearer token</span></div>
        <div className="bridge-node"><span className="bridge-ic is-app"><A.Mark size={18} /></span><b>APM</b><span className="caption status-ok"><span className="live-dot" />Unlocked</span></div>
        <div className="bridge-wire is-live"><i /><span className="mono-small">decrypts</span></div>
        <div className="bridge-node"><span className="bridge-ic"><A.Icon name="file-lock-2" size={16} /></span><b>vault.dat</b><span className="caption muted">{ITEMS.length} items</span></div>
      </div>
      <Group>
        <A.SettingRow title="APM app" description={VAULT_META.app + " on this Mac"}><A.Badge tone="success" icon="circle-check">Connected</A.Badge></A.SettingRow>
        <A.SettingRow title="Bridge address" description="Loopback only. Nothing outside this computer can reach it."><span className="mono">127.0.0.1:{VAULT_META.port}</span></A.SettingRow>
        <A.SettingRow title="Pairing" description={VAULT_META.paired + ". Rotating the token in APM disconnects this browser."}><A.Button size="sm" variant="secondary" icon="refresh-ccw">Paste new token</A.Button></A.SettingRow>
      </Group>
      <Group title="Danger zone">
        <A.SettingRow danger title="Forget this browser" description="Removes the pairing token from Chrome. Your vault is not touched."><A.Button size="sm" variant="danger" onClick={() => setForget(true)}>Forget</A.Button></A.SettingRow>
      </Group>
      {forget && <A.Callout tone="danger" title="Forget this browser?" action={<><A.Button size="sm" variant="ghost" onClick={() => setForget(false)}>Cancel</A.Button><A.Button size="sm" variant="danger" onClick={() => setForget(false)}>Forget</A.Button></>}>You will need to paste a pairing token again to fill from APM.</A.Callout>}
    </>
  );
}

function Autofill() {
  const [match, setMatch] = React.useState("domain");
  return (
    <>
      <Head title="Autofill">How APM helps on sign-in and sign-up forms.</Head>
      <Group title="On the page">
        <Toggle title="Show the APM menu on login fields" description="Opens when you focus a username, password or one-time code field." />
        <Toggle title="Show the APM icon inside fields" description="A small bird at the right edge of fields APM can fill." />
        <Toggle title="Suggest strong passwords on sign-up forms" />
        <Toggle title="Fill the one-time code after a login" description="Copies the code and fills it on the next page when the site asks." />
      </Group>
      <Group title="Saving">
        <Toggle title="Offer to save new logins" />
        <Toggle title="Offer to update changed passwords" description="The old password stays in the item's history for 90 days." />
        <A.SettingRow title="Save new logins to" description="You can change the space in each prompt."><A.Select id="save-space" size="sm" value="personal" options={[{ value: "personal", label: "Personal" }, { value: "work", label: "Work" }, { value: "ask", label: "Ask every time" }]} /></A.SettingRow>
      </Group>
      <Group title="Matching" foot="Base domain treats app.harbor.dev and harbor.dev as the same site.">
        <A.SettingRow title="Match websites by"><A.Select id="match" size="sm" value={match} onChange={setMatch} options={[{ value: "domain", label: "Base domain" }, { value: "host", label: "Exact host" }, { value: "prefix", label: "Starts with URL" }]} /></A.SettingRow>
      </Group>
    </>
  );
}

function PasskeySettings() {
  const count = ITEMS.reduce((a, i) => a + (i.passkeys || []).length, 0);
  return (
    <>
      <Head title="Passkeys">APM answers passkey requests inside the page, so Chrome's own passkey sheet never opens for sites APM handles.</Head>
      <Group>
        <Toggle title="Use APM for passkeys" description={"Create and sign with passkeys stored in your vault. " + count + " saved."} />
        <Toggle title="Ask before creating a passkey" description="Shows the save sheet so you can pick the login it belongs to." />
        <Toggle title="Offer passkeys in the login menu" />
      </Group>
      <A.Callout tone="neutral" icon="info" title="When Chrome takes over">Sites that accept only RS256 keys, or that require platform attestation, go to Chrome's own flow. Nothing breaks, APM just steps aside.</A.Callout>
    </>
  );
}

function Security() {
  return (
    <>
      <Head title="Security">These follow your APM settings where they overlap.</Head>
      <Group>
        <A.SettingRow title="Clear the clipboard after" description="Set in APM. Applies to passwords, keys and codes."><span className="mono">30s</span></A.SettingRow>
        <A.SettingRow title="Lock with APM" description="The extension locks the moment APM locks. This cannot be turned off."><A.Badge tone="neutral" icon="lock">Always</A.Badge></A.SettingRow>
        <Toggle title="Lock when Chrome closes" />
        <Toggle title="Never fill on http:// pages" description="Unencrypted pages can be read on the network." />
        <Toggle title="Fill inside cross-site frames" description="Off by default. A frame from another site could be hidden over the real form." on={false} />
      </Group>
    </>
  );
}

function Shortcuts() {
  const rows = [["Open APM", ["⌥", "⇧", "A"]], ["Fill the best login for this page", ["⌥", "⇧", "F"]], ["Generate and fill a password", ["⌥", "⇧", "G"]], ["Copy the one-time code for this page", ["⌥", "⇧", "C"]], ["Lock vault", ["⌥", "⇧", "L"]]];
  return (
    <>
      <Head title="Shortcuts">Chrome owns extension shortcuts. Change them at chrome://extensions/shortcuts.</Head>
      <Group>{rows.map(([t, k]) => <A.SettingRow key={t} title={t}><A.Kbd keys={k} /></A.SettingRow>)}</Group>
      <Group title="In the APM menu on a page">
        <A.SettingRow title="Move between logins"><A.Kbd keys={["↑", "↓"]} /></A.SettingRow>
        <A.SettingRow title="Fill the highlighted login"><A.Kbd keys={["↵"]} /></A.SettingRow>
        <A.SettingRow title="Close the menu"><A.Kbd keys={["Esc"]} /></A.SettingRow>
      </Group>
    </>
  );
}

function Sites() {
  const [rows, setRows] = React.useState(EXCLUDED);
  const [host, setHost] = React.useState("");
  const [rule, setRule] = React.useState("Never fill");
  return (
    <>
      <Head title="Excluded sites">APM stays quiet on these sites.</Head>
      <form className="site-add" onSubmit={(e) => { e.preventDefault(); if (host) { setRows([{ host, rule }].concat(rows)); setHost(""); } }}>
        <A.Input id="ex-host" size="sm" placeholder="example.com" icon="globe" value={host} onChange={(e) => setHost(e.target.value)} />
        <A.Select id="ex-rule" size="sm" value={rule} onChange={setRule} options={["Never fill", "Never save", "Never fill or save"]} />
        <A.Button size="sm" variant="secondary" type="submit" icon="plus">Add</A.Button>
      </form>
      <Group>
        {rows.map((r) => (
          <A.SettingRow key={r.host} title={<span className="mono">{r.host}</span>} description={r.rule}>
            <A.IconButton icon="trash-2" label={"Remove " + r.host} size="sm" onClick={() => setRows(rows.filter((x) => x.host !== r.host))} />
          </A.SettingRow>
        ))}
      </Group>
      {!rows.length && <A.EmptyState icon="shield-off" title="No excluded sites">Add a site, or choose "Never for this site" in a save prompt.</A.EmptyState>}
    </>
  );
}

function About() {
  const perms = [
    ["storage", "Keeps the pairing token and your extension settings."],
    ["activeTab, scripting", "Reads the forms on the page you are on, only to fill them."],
    ["contextMenus", "Adds Fill with APM to the right-click menu on fields."],
    ["offscreen", "Clears the clipboard after 30s when the popup is closed."],
    ["127.0.0.1", "Talks to the APM app. No other host is contacted."]
  ];
  return (
    <>
      <Head title="About" />
      <Group>
        <A.SettingRow title="Extension"><span className="mono">{VAULT_META.ext}</span></A.SettingRow>
        <A.SettingRow title="APM app"><span className="mono">{VAULT_META.app}</span></A.SettingRow>
        <A.SettingRow title="Vault encryption"><span className="mono">{VAULT_META.cipher} · {VAULT_META.kdf}</span></A.SettingRow>
      </Group>
      <Group title="Permissions" foot="APM never fetches site icons, sends analytics or calls a server of its own.">
        {perms.map(([p, d]) => <A.SettingRow key={p} title={<span className="mono">{p}</span>} description={d} />)}
      </Group>
    </>
  );
}
