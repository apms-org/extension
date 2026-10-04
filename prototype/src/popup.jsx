import { A, cx, n, Colorized, generate, strength, GEN_DEFAULTS, ToastHost, useToast, copyToast, Overline } from "./util.jsx";
import { TYPES, SPACES, SITE, ITEMS, CAPTURE, VAULT_META } from "./seed.js";

const spaceName = (id) => (SPACES.find((s) => s.id === id) || { name: "All spaces" }).name;
const typeIcon = (it) => (it.type === "login" ? undefined : TYPES[it.type].icon);

const SECRET_LABEL = { login: "Password", apikey: "Key", cloud: "Secret access key", card: "Card number", wifi: "Password", identity: "Passport number", note: "Note", ssh: "Private key" };
const USER_LABEL = { login: "Username", apikey: "Scope", cloud: "Access key ID", card: "Card", wifi: "Security", identity: "Holder", note: "Summary", ssh: "Fingerprint" };

export function Popup({ scene, onFill, onClose }) {
  return (
    <div className="px" role="dialog" aria-label="APM">
      <ToastHost className="px-toasts">
        <PopupBody scene={scene} onFill={onFill} onClose={onClose} />
      </ToastHost>
    </div>
  );
}

function PopupBody({ scene, onFill }) {
  const push = useToast();
  const [gate, setGate] = React.useState(scene.gate || "open");
  const [tab, setTab] = React.useState(scene.tab || "site");
  const [stack, setStack] = React.useState(scene.stack || []);
  const [space, setSpace] = React.useState("all");
  const [items, setItems] = React.useState(ITEMS);
  const [capture, setCapture] = React.useState(scene.capture ? CAPTURE : null);
  const top = stack[stack.length - 1];
  const go = (v) => setStack(stack.concat([v]));
  const back = () => setStack(stack.slice(0, -1));
  const visible = items.filter((i) => space === "all" || i.space === space);

  if (gate === "pair") return <Pair error={scene.error} onDone={() => setGate("open")} />;
  if (gate === "offline") return <Offline onRetry={() => setGate("locked")} />;
  if (gate === "locked") return <Locked error={scene.error} onUnlock={() => setGate("open")} />;

  const fill = (it) => { onFill && onFill(it); push({ title: "Filled " + it.user + " on " + SITE.host, description: it.totp ? "One-time code copied" : null, countdown: it.totp ? 30 : undefined }); };
  const lock = () => { setStack([]); setGate("locked"); };

  if (top && top.v === "detail") {
    const it = items.find((x) => x.id === top.id);
    return <Detail item={it} onBack={back} onFill={fill} onDelete={() => { setItems(items.filter((x) => x.id !== it.id)); back(); push({ title: "Moved " + it.title + " to trash", tone: "neutral", icon: "trash-2" }); }} onFav={() => setItems(items.map((x) => x.id === it.id ? Object.assign({}, x, { fav: !x.fav }) : x))} />;
  }
  if (top && top.v === "new") return <NewLogin onBack={back} onSave={(it) => { setItems([it].concat(items)); setStack([]); setTab("site"); push({ title: "Saved " + it.title + " to " + spaceName(it.space) }); }} />;
  if (top && top.v === "passkeys") return <Passkeys items={items} setItems={setItems} onBack={back} onOpen={(id) => go({ v: "detail", id })} />;
  if (top && top.v === "save-passkey") return <SavePasskey items={items} onBack={back} onSaved={(id, title) => { setItems(items.map((x) => x.id === id ? Object.assign({}, x, { passkeys: (x.passkeys || []).concat([{ id: "pk-new", user: CAPTURE.user, created: "Sep 29, 2026", used: "now" }]) }) : x)); setCapture(null); setStack([{ v: "saved", title }]); }} />;
  if (top && top.v === "saved") return <Saved title={top.title} onDone={() => setStack([])} />;

  const siteMatches = visible.filter((i) => i.url === SITE.host);
  return (
    <>
      <Head space={space} setSpace={setSpace} items={items} onNew={() => go({ v: "new" })} onLock={lock} onPasskeys={() => go({ v: "passkeys" })} />
      <div className="px-tabs">
        <A.Tabs label="Sections" value={tab} onChange={setTab} items={[
          { value: "site", label: "This site", count: siteMatches.length },
          { value: "vault", label: "Vault" },
          { value: "codes", label: "Codes" },
          { value: "gen", label: "Generator" }
        ]} />
      </div>
      <div className="px-body" key={tab}>
        {tab === "site" && <SiteTab items={siteMatches} all={items} capture={capture} onOpen={(id) => go({ v: "detail", id })} onFill={fill} onNew={() => go({ v: "new" })} onSaveCapture={() => go({ v: "save-passkey" })} onDismissCapture={() => { setCapture(null); push({ title: "Passkey discarded", description: "webauthn.io keeps the key it was given", tone: "neutral", icon: "trash-2" }); }} />}
        {tab === "vault" && <VaultTab items={visible} query={scene.query} onOpen={(id) => go({ v: "detail", id })} onNew={() => go({ v: "new" })} />}
        {tab === "codes" && <CodesTab items={visible} />}
        {tab === "gen" && <GenTab onFill={(v) => push({ title: "Filled password on " + SITE.host, description: "APM offers to save it when you submit" })} />}
      </div>
      <Foot />
    </>
  );
}

function Head({ space, setSpace, items, onNew, onLock, onPasskeys }) {
  const count = (id) => String(items.filter((i) => id === "all" || i.space === id).length);
  return (
    <header className="px-head">
      <A.Menu label="Spaces" width={220} trigger={<button type="button" className="space-btn"><A.Mark tile size={22} /><span className="space-name">{spaceName(space)}</span><A.Icon name="chevrons-up-down" size={14} /></button>} items={[
        { section: "Spaces" },
        { label: "All spaces", icon: "layers", hint: count("all"), checked: space === "all", onSelect: () => setSpace("all") },
        ...SPACES.map((s) => ({ label: s.name, icon: "folder", hint: count(s.id), checked: space === s.id, onSelect: () => setSpace(s.id) }))
      ]} />
      <div className="px-head-actions">
        <A.IconButton icon="plus" label="New login" size="sm" onClick={onNew} />
        <A.IconButton icon="lock" label="Lock vault" size="sm" onClick={onLock} />
        <A.Menu align="end" width={236} label="More" trigger={<A.IconButton icon="ellipsis" label="More" size="sm" />} items={[
          { label: "Open APM", icon: "external-link" },
          { label: "Passkeys", icon: "fingerprint", onSelect: onPasskeys },
          { label: "Extension settings", icon: "settings" },
          { separator: true },
          { label: "Pause APM on " + SITE.host, icon: "power" },
          { label: "Lock vault", icon: "lock", kbd: ["⌥", "⇧", "L"], onSelect: onLock }
        ]} />
      </div>
    </header>
  );
}

function Foot() {
  return (
    <footer className="px-foot">
      <span className="live-dot" aria-hidden="true" />
      <span>Connected to {VAULT_META.app}</span>
      <span className="px-foot-end mono-small">Locks in 14m</span>
    </footer>
  );
}

function SiteTab({ items, all, capture, onOpen, onFill, onNew, onSaveCapture, onDismissCapture }) {
  const push = useToast();
  const logins = items.filter((i) => i.type === "login");
  const others = items.filter((i) => i.type !== "login");
  const keys = logins.flatMap((i) => (i.passkeys || []).map((p) => ({ it: i, p })));
  const reused = logins.find((i) => i.reused);
  return (
    <div className="stack">
      {capture && (
        <A.Callout tone="accent" icon="fingerprint" title="Passkey waiting to be saved" action={<><A.IconButton icon="x" label="Discard passkey" size="sm" onClick={onDismissCapture} /><A.Button size="sm" onClick={onSaveCapture}>Save</A.Button></>}>
          {capture.rp} created one for {capture.user}. Choose a login to keep it in. Nothing is stored until you do.
        </A.Callout>
      )}
      <div className="site-head">
        <span className="site-tile"><A.Icon name="globe-lock" size={16} /></span>
        <span className="site-text"><span className="site-host">{SITE.host}</span><span className="site-sub">{items.length ? n(items.length, "item") + " match this site" : "Nothing saved for this site yet"}</span></span>
        <A.Button size="sm" variant="ghost" icon="plus" onClick={onNew}>New</A.Button>
      </div>
      {reused && (
        <A.Callout tone="warning" title="Reused password" action={<A.Button size="sm" variant="secondary" iconRight="arrow-up-right">Change</A.Button>}>
          {reused.title} ({reused.user}) shares its password with {reused.reused.join(" and ")}. If one leaks, both are exposed.
        </A.Callout>
      )}
      {logins.length > 0 && <section className="sect">
        <Overline count={logins.length}>Logins</Overline>
        <div className="matches">
          {logins.map((it, i) => <Match key={it.id} it={it} primary={i === 0} onOpen={() => onOpen(it.id)} onFill={() => onFill(it)} push={push} />)}
        </div>
      </section>}
      {keys.length > 0 && <section className="sect">
        <Overline count={keys.length}>Passkeys</Overline>
        {keys.map(({ it, p }) => (
          <div className="pk-row" key={p.id}>
            <A.ItemIcon icon="fingerprint" />
            <span className="row-text"><span className="row-title">{p.user}</span><span className="row-sub">In {it.title} · {spaceName(it.space)}</span></span>
            <span className="row-time">{p.used}</span>
          </div>
        ))}
        <p className="hint">Harbor asks for the passkey when you choose "Sign in with a passkey". APM answers in the page.</p>
      </section>}
      {others.length > 0 && <section className="sect">
        <Overline count={others.length}>Also for this site</Overline>
        {others.map((it) => <A.ItemRow key={it.id} title={it.title} subtitle={it.user} icon={typeIcon(it)} time={it.used} onClick={() => onOpen(it.id)} />)}
      </section>}
      {!items.length && <A.EmptyState icon="globe" title={"Nothing saved for " + SITE.host}>Sign in as usual and APM offers to save the login, or add it now.</A.EmptyState>}
      <A.Button variant="secondary" block icon="plus" onClick={onNew}>Save a login for {SITE.host}</A.Button>
    </div>
  );
}

function Match({ it, primary, onOpen, onFill, push }) {
  const code = React.useRef("");
  return (
    <div className="match">
      <div className="match-top">
        <button type="button" className="match-main" onClick={onOpen}>
          <A.ItemIcon name={it.title} />
          <span className="row-text">
            <span className="row-title">{it.user}</span>
            <span className="row-sub">{spaceName(it.space)}{it.passkeys && it.passkeys.length ? " · Passkey" : ""}</span>
          </span>
        </button>
        <div className="match-actions">
          <A.IconButton icon="user" label="Copy username" size="sm" onClick={() => copyToast(push, "username", false, it.user)} />
          <A.IconButton icon="key-round" label="Copy password" size="sm" onClick={() => copyToast(push, "password", true, it.password)} />
          <A.Button size="sm" variant={primary ? "primary" : "secondary"} onClick={onFill}>Fill</A.Button>
        </div>
      </div>
      {it.totp && (
        <div className="match-code">
          <span className="match-code-label"><A.Icon name="timer" size={14} />One-time code</span>
          <A.TotpCode secret={it.totp} onCode={(c) => { code.current = c; }} />
          <A.IconButton icon="copy" label="Copy one-time code" size="xs" onClick={() => copyToast(push, "one-time code", true, code.current)} />
        </div>
      )}
    </div>
  );
}

function Detail({ item: it, onBack, onFill, onDelete, onFav }) {
  const push = useToast();
  const [confirm, setConfirm] = React.useState(false);
  const onCopy = (label, v) => copyToast(push, label.toLowerCase(), /password|key|number|note|code/i.test(label), v);
  const isLogin = it.type === "login";
  const here = it.url === SITE.host;
  return (
    <div className="px-sub">
      <SubHead title={it.title} onBack={onBack} menu={[
        { label: it.fav ? "Remove from favorites" : "Add to favorites", icon: "star", onSelect: onFav },
        { label: "Edit in APM", icon: "square-pen" },
        { label: "Move to " + (it.space === "work" ? "Personal" : "Work"), icon: "folder" },
        { separator: true },
        { label: "Move to trash", icon: "trash-2", danger: true, onSelect: () => setConfirm(true) }
      ]} />
      <div className="px-body">
        <div className="stack">
          <div className="det-hero">
            <A.ItemIcon name={it.title} icon={typeIcon(it)} size="lg" />
            <div className="det-hero-text">
              <div className="title-2">{it.title}</div>
              <div className="det-meta">
                <span>{spaceName(it.space)} · {TYPES[it.type].one}</span>
                {it.reused && <A.Badge tone="warning" icon="triangle-alert" size="sm">Reused</A.Badge>}
                {it.weak && <A.Badge tone="warning" icon="triangle-alert" size="sm">Weak</A.Badge>}
              </div>
            </div>
          </div>
          {confirm && (
            <A.Callout tone="danger" icon="trash-2" title={"Move " + it.title + " to trash?"} action={<><A.Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</A.Button><A.Button size="sm" variant="danger" onClick={onDelete}>Move</A.Button></>}>
              You can restore it from Trash in APM for 30 days.
            </A.Callout>
          )}
          <A.FieldGroup className="fg-compact">
            <A.SecretField label={USER_LABEL[it.type]} value={it.user} mono={it.type === "cloud" || it.type === "ssh"} onCopy={onCopy} />
            {(it.password || it.secret) && (
              <A.SecretField label={SECRET_LABEL[it.type]} secret={it.type !== "note"} value={it.password || it.secret} copyValue={it.password || it.secret} onCopy={onCopy}>
                {isLogin && <A.StrengthMeter score={it.score} bits={it.bits} />}
              </A.SecretField>
            )}
            {it.totp && <A.SecretField label="One-time code" totp={it.totp} onCopy={onCopy} />}
            {it.url && <A.SecretField label="Website" value={it.url} href={"https://" + it.url} copyable={false} />}
            {(it.passkeys || []).map((p) => <A.SecretField key={p.id} label="Passkey" value={p.user + " · ES256"} copyable={false} />)}
          </A.FieldGroup>
          {it.reused && <p className="hint warn-hint"><A.Icon name="triangle-alert" size={14} />Same password as {it.reused.join(", ")}. Change it on {it.url} and APM offers to update this login.</p>}
          <div className="det-foot mono-small">{[it.changed, it.created].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      <div className="px-bar">
        <A.Button variant="secondary" icon="external-link">Open in APM</A.Button>
        {isLogin && here ? <A.Button variant="primary" block onClick={() => { onFill(it); onBack(); }}>Fill on {SITE.host}</A.Button>
          : <A.Button variant="primary" block icon="copy" onClick={() => copyToast(push, SECRET_LABEL[it.type].toLowerCase(), true, it.password || it.secret)}>Copy {SECRET_LABEL[it.type].toLowerCase()}</A.Button>}
      </div>
    </div>
  );
}

function SubHead({ title, onBack, menu, end }) {
  return (
    <header className="px-head sub">
      <A.IconButton icon="arrow-left" label="Back" size="sm" onClick={onBack} />
      <span className="sub-title">{title}</span>
      {end}
      {menu && <A.Menu align="end" width={224} label="Item actions" trigger={<A.IconButton icon="ellipsis" label="Item actions" size="sm" />} items={menu} />}
    </header>
  );
}

const GROUPS = ["Today", "This week", "Earlier"];

function VaultTab({ items, query, onOpen, onNew }) {
  const [q, setQ] = React.useState(query || "");
  const [type, setType] = React.useState("all");
  const t = q.trim().toLowerCase();
  const hits = items.filter((i) => (type === "all" || i.type === type) && (!t || [i.title, i.user, i.url, TYPES[i.type].label, i.space].join(" ").toLowerCase().includes(t)));
  const typeOpts = [{ value: "all", label: "All types" }].concat(Object.keys(TYPES).filter((k) => items.some((i) => i.type === k)).map((k) => ({ value: k, label: TYPES[k].label + "  " + items.filter((i) => i.type === k).length })));
  return (
    <div className="vault">
      <div className="vault-tools">
        <A.SearchField size="sm" value={q} onChange={setQ} placeholder={"Search " + n(items.length, "item")} shortcut={["/"]} autoFocus={!!query} />
        <A.Select id="vault-type" size="sm" icon="list-filter" value={type} onChange={setType} options={typeOpts} />
      </div>
      {!hits.length && (
        <A.EmptyState icon="search" title={"No matches for \"" + q + "\""} action={<A.Button size="sm" variant="secondary" icon="plus" onClick={onNew}>New login</A.Button>}>
          Search looks at names, usernames, websites, types and spaces.
        </A.EmptyState>
      )}
      {GROUPS.map((g) => {
        const rows = hits.filter((i) => i.group === g);
        if (!rows.length) return null;
        return (
          <section key={g} className="vgroup">
            <div className="vgroup-head"><span>{g}</span><span className="ovl-count">{rows.length}</span></div>
            {rows.map((it) => <A.ItemRow key={it.id} title={it.title} subtitle={it.user} icon={typeIcon(it)} time={it.used} favorite={it.fav} alert={it.reused || it.weak ? "warning" : undefined} mono={it.type === "cloud"} onClick={() => onOpen(it.id)} />)}
          </section>
        );
      })}
    </div>
  );
}

function CodesTab({ items }) {
  const push = useToast();
  const [q, setQ] = React.useState("");
  const all = items.filter((i) => i.totp && (!q || (i.title + " " + i.user).toLowerCase().includes(q.toLowerCase())));
  const here = all.filter((i) => i.url === SITE.host);
  const rest = all.filter((i) => i.url !== SITE.host);
  return (
    <div className="stack tight">
      <A.SearchField size="sm" value={q} onChange={setQ} placeholder={"Search " + n(items.filter((i) => i.totp).length, "code")} shortcut={null} />
      {here.length > 0 && <section className="sect"><Overline count={here.length}>For {SITE.host}</Overline>{here.map((i) => <CodeRow key={i.id} it={i} push={push} />)}</section>}
      {rest.length > 0 && <section className="sect"><Overline count={rest.length}>All codes</Overline>{rest.map((i) => <CodeRow key={i.id} it={i} push={push} />)}</section>}
      {!all.length && <A.EmptyState icon="timer" title={"No codes match \"" + q + "\""}>Codes come from logins with a one-time code setup key.</A.EmptyState>}
    </div>
  );
}

function CodeRow({ it, push }) {
  const code = React.useRef("");
  const copy = () => copyToast(push, it.title + " code", true, code.current);
  return (
    <div className="code-row" onClick={copy} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") copy(); }} title="Click to copy">
      <A.ItemIcon name={it.title} />
      <span className="row-text"><span className="row-title">{it.title}</span><span className="row-sub">{it.user}</span></span>
      <A.TotpCode secret={it.totp} onCode={(c) => { code.current = c; }} />
    </div>
  );
}

const history = [];

export function GenPanel({ onFill, fillLabel, compact }) {
  const push = useToast();
  const [o, setO] = React.useState(GEN_DEFAULTS);
  const [v, setV] = React.useState(() => generate(GEN_DEFAULTS));
  const [spin, setSpin] = React.useState(0);
  const [, force] = React.useState(0);
  const set = (p) => { const x = Object.assign({}, o, p); setO(x); setV(generate(x)); setSpin(spin + 1); };
  const regen = () => { setV(generate(o)); setSpin(spin + 1); };
  const keep = () => { history.unshift({ v, t: "now" }); if (history.length > 4) history.length = 4; force(Date.now()); };
  const s = strength(o);
  return (
    <div className={cx("gen", compact && "is-compact")}>
      <div className="gen-out">
        <div className="gen-value mono" key={spin}><Colorized value={v} /></div>
        <div className="gen-out-actions">
          <A.IconButton icon="refresh-cw" label="Generate another" size="sm" onClick={regen} />
          <A.IconButton icon="copy" label="Copy" size="sm" onClick={() => { keep(); copyToast(push, "password", true, v); }} />
        </div>
      </div>
      <A.StrengthMeter key={"s" + spin} score={s.score} bits={s.bits} detail={s.detail} />
      <A.SegmentedControl label="Kind" value={o.mode} onChange={(m) => set({ mode: m })} options={[{ value: "random", label: "Random" }, { value: "passphrase", label: "Passphrase" }, { value: "pin", label: "PIN" }]} />
      {o.mode === "random" && <>
        <div className="slider-row"><label htmlFor="gen-len">Length</label><A.Slider id="gen-len" label="Length" min={8} max={64} value={o.length} onChange={(x) => set({ length: x })} /><span className="mono">{o.length}</span></div>
        <div className="gen-checks">
          <A.Checkbox checked={o.upper} onChange={(x) => set({ upper: x })} label="A-Z" />
          <A.Checkbox checked={o.lower} onChange={(x) => set({ lower: x })} label="a-z" />
          <A.Checkbox checked={o.digits} onChange={(x) => set({ digits: x })} label="0-9" />
          <A.Checkbox checked={o.symbols} onChange={(x) => set({ symbols: x })} label="!@#$" />
        </div>
        {!compact && <A.Checkbox checked={o.avoidAmbiguous} onChange={(x) => set({ avoidAmbiguous: x })} label="Avoid look-alikes" description="Leaves out I, l, 1, O, 0 and quote marks" />}
      </>}
      {o.mode === "passphrase" && <>
        <div className="slider-row"><label htmlFor="gen-words">Words</label><A.Slider id="gen-words" label="Words" min={3} max={10} value={o.words} onChange={(x) => set({ words: x })} /><span className="mono">{o.words}</span></div>
        <div className="gen-checks">
          <A.Checkbox checked={o.capitalize} onChange={(x) => set({ capitalize: x })} label="Capitalize" />
          <A.Checkbox checked={o.number} onChange={(x) => set({ number: x })} label="Add a number" />
        </div>
      </>}
      {o.mode === "pin" && <div className="slider-row"><label htmlFor="gen-pin">Digits</label><A.Slider id="gen-pin" label="Digits" min={4} max={12} value={o.pinLength} onChange={(x) => set({ pinLength: x })} /><span className="mono">{o.pinLength}</span></div>}
      {onFill && <A.Button variant="primary" block icon="check" onClick={() => { keep(); onFill(v); }}>{fillLabel || "Fill on " + SITE.host}</A.Button>}
      {!compact && history.length > 0 && (
        <section className="sect">
          <Overline count={history.length}>Copied this session</Overline>
          {history.map((h, i) => <div className="hist-row" key={i}><span className="hist-v mono"><Colorized value={h.v} /></span><span className="row-time">{h.t}</span></div>)}
        </section>
      )}
      {!compact && <p className="hint mono-small">Made in this browser with crypto.getRandomValues. Nothing leaves it until you save a login.</p>}
    </div>
  );
}

function GenTab({ onFill }) {
  return <GenPanel onFill={onFill} />;
}

function NewLogin({ onBack, onSave }) {
  const [name, setName] = React.useState(SITE.name);
  const [url, setUrl] = React.useState(SITE.host);
  const [user, setUser] = React.useState("aarav@maloo.dev");
  const [pw, setPw] = React.useState(() => generate(GEN_DEFAULTS));
  const [shown, setShown] = React.useState(false);
  const [space, setSpace] = React.useState("personal");
  const [key, setKey] = React.useState("");
  const s = strength(GEN_DEFAULTS);
  return (
    <div className="px-sub">
      <SubHead title="New login" onBack={onBack} />
      <div className="px-body">
        <form className="form" id="new-login" onSubmit={(e) => { e.preventDefault(); onSave({ id: "new-" + Date.now(), type: "login", title: name, user, password: pw, url, space, used: "now", group: "Today", score: s.score, bits: s.bits, totp: key ? "JBSWY3DPEHPK3PXP" : undefined, created: "Created Sep 29, 2026", passkeys: [] }); }}>
          <A.Input id="nl-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <A.Input id="nl-url" label="Website" value={url} onChange={(e) => setUrl(e.target.value)} icon="globe" />
          <A.Input id="nl-user" label="Username" value={user} onChange={(e) => setUser(e.target.value)} icon="user" />
          <div className="pw-field">
            <A.Input id="nl-pw" label="Password" type={shown ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} className="mono-input" trailing={<><A.IconButton icon={shown ? "eye-off" : "eye"} label={shown ? "Hide" : "Reveal"} size="xs" onClick={() => setShown(!shown)} /><A.IconButton icon="dices" label="Generate password" size="xs" onClick={() => setPw(generate(GEN_DEFAULTS))} /></>} />
            <A.StrengthMeter score={s.score} bits={s.bits} detail={s.detail} />
          </div>
          <A.Select id="nl-space" label="Space" value={space} onChange={setSpace} options={SPACES.map((x) => ({ value: x.id, label: x.name }))} />
          <A.Input id="nl-totp" label="One-time code key" hint="Optional. Paste the setup key from the site's two-factor page." placeholder="JBSW Y3DP EHPK 3PXP" value={key} onChange={(e) => setKey(e.target.value)} icon="timer" />
        </form>
      </div>
      <div className="px-bar">
        <A.Button variant="ghost" onClick={onBack}>Cancel</A.Button>
        <A.Button variant="primary" block type="submit" form="new-login">Save login</A.Button>
      </div>
    </div>
  );
}

function Passkeys({ items, setItems, onBack, onOpen }) {
  const push = useToast();
  const [q, setQ] = React.useState("");
  const [renaming, setRenaming] = React.useState(null);
  const [removing, setRemoving] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const all = items.flatMap((it) => (it.passkeys || []).map((p) => ({ it, p }))).filter(({ it, p }) => !q || (it.url + " " + p.user + " " + it.title).toLowerCase().includes(q.toLowerCase()));
  const edit = (id, fn) => setItems(items.map((it) => Object.assign({}, it, { passkeys: (it.passkeys || []).map((p) => (p.id === id ? fn(p) : p)).filter(Boolean) })));
  return (
    <div className="px-sub">
      <SubHead title="Passkeys" onBack={onBack} end={<span className="sub-count">{all.length}</span>} />
      <div className="px-body">
        <div className="stack tight">
          <A.SearchField size="sm" value={q} onChange={setQ} placeholder="Search passkeys" shortcut={null} />
          {all.map(({ it, p }) => (
            <div key={p.id} className="pk-item">
              {renaming === p.id ? (
                <form className="pk-rename" onSubmit={(e) => { e.preventDefault(); edit(p.id, (x) => Object.assign({}, x, { user: draft })); setRenaming(null); push({ title: "Renamed passkey" }); }}>
                  <A.Input id={"rn-" + p.id} size="sm" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} />
                  <A.Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</A.Button>
                  <A.Button size="sm" variant="primary" type="submit">Save</A.Button>
                </form>
              ) : (
                <div className="pk-row">
                  <A.ItemIcon icon="fingerprint" />
                  <span className="row-text"><span className="row-title">{it.url}</span><span className="row-sub">{p.user} · in {it.title}, {spaceName(it.space)}</span></span>
                  <span className="row-time">{p.used}</span>
                  <A.Menu align="end" width={200} label="Passkey actions" trigger={<A.IconButton icon="ellipsis" label="Passkey actions" size="xs" />} items={[
                    { label: "Rename", icon: "pencil", onSelect: () => { setDraft(p.user); setRenaming(p.id); } },
                    { label: "Open " + it.title, icon: "arrow-right", onSelect: () => onOpen(it.id) },
                    { separator: true },
                    { label: "Remove", icon: "trash-2", danger: true, onSelect: () => setRemoving(p.id) }
                  ]} />
                </div>
              )}
              {removing === p.id && (
                <A.Callout tone="danger" icon="trash-2" title={"Remove the passkey for " + it.url + "?"} action={<><A.Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancel</A.Button><A.Button size="sm" variant="danger" onClick={() => { edit(p.id, () => null); setRemoving(null); push({ title: "Removed passkey for " + it.url, tone: "neutral", icon: "trash-2" }); }}>Remove</A.Button></>}>
                  {it.url} still trusts it. Remove it there too, or you may be asked for it again.
                </A.Callout>
              )}
            </div>
          ))}
          {!all.length && <A.EmptyState icon="fingerprint" title="No passkeys yet">When a site offers to create a passkey, APM saves it to your vault instead of this browser.</A.EmptyState>}
          <p className="hint mono-small">ES256 · P-256 private keys, stored inside vault.dat</p>
        </div>
      </div>
    </div>
  );
}

function SavePasskey({ items, onBack, onSaved }) {
  const [q, setQ] = React.useState("");
  const suggested = items.filter((i) => i.url === CAPTURE.rp && i.type === "login");
  const [pick, setPick] = React.useState(suggested[0] ? suggested[0].id : null);
  const [creating, setCreating] = React.useState(false);
  const rest = items.filter((i) => i.type === "login" && i.url !== CAPTURE.rp && (!q || (i.title + " " + i.user).toLowerCase().includes(q.toLowerCase()))).slice(0, 6);
  const chosen = items.find((i) => i.id === pick);
  const Row = ({ it }) => (
    <button type="button" className={cx("pick", pick === it.id && "is-on")} onClick={() => { setPick(it.id); setCreating(false); }} aria-pressed={pick === it.id}>
      <A.ItemIcon name={it.title} />
      <span className="row-text"><span className="row-title">{it.title}</span><span className="row-sub">{it.user} · {spaceName(it.space)}</span></span>
      <span className="pick-mark">{pick === it.id && <A.Icon name="check" size={14} strokeWidth={2.25} />}</span>
    </button>
  );
  return (
    <div className="px-sub">
      <SubHead title="Save passkey" onBack={onBack} />
      <div className="px-body">
        <div className="stack tight">
          <div className="cap-card">
            <A.ItemIcon icon="fingerprint" />
            <span className="row-text"><span className="row-title">{CAPTURE.rp}</span><span className="row-sub mono-small">{CAPTURE.user} · {CAPTURE.alg} · created {CAPTURE.at} ago</span></span>
          </div>
          <p className="small muted">Choose the login this passkey belongs to.</p>
          {suggested.length > 0 && <section className="sect"><Overline>Suggested</Overline>{suggested.map((it) => <Row key={it.id} it={it} />)}</section>}
          <section className="sect">
            <Overline>Other logins</Overline>
            <A.SearchField size="sm" value={q} onChange={setQ} placeholder="Search logins" shortcut={null} />
            {rest.map((it) => <Row key={it.id} it={it} />)}
            <button type="button" className={cx("pick", creating && "is-on")} onClick={() => { setCreating(true); setPick(null); }}>
              <span className="apm-tile apm-tile-md"><A.Icon name="plus" size={16} /></span>
              <span className="row-text"><span className="row-title">New login for {CAPTURE.rp}</span><span className="row-sub">Creates an item that holds only the passkey</span></span>
              <span className="pick-mark">{creating && <A.Icon name="check" size={14} strokeWidth={2.25} />}</span>
            </button>
          </section>
        </div>
      </div>
      <div className="px-bar">
        <A.Button variant="ghost" onClick={onBack}>Cancel</A.Button>
        <A.Button variant="primary" block icon="fingerprint" disabled={!pick && !creating} onClick={() => onSaved(pick, creating ? CAPTURE.rp : chosen.title)}>Save passkey</A.Button>
      </div>
    </div>
  );
}

function Saved({ title, onDone }) {
  return (
    <div className="px-center">
      <span className="done-ring"><A.Icon name="check" size={22} strokeWidth={2.25} /></span>
      <div className="title-2">Passkey saved</div>
      <p className="small muted center">Saved to {title}. The next sign-in on {CAPTURE.rp} uses it from your vault.</p>
      <A.Button variant="primary" onClick={onDone}>Done</A.Button>
      <p className="mono-small muted">audit: PASSKEY_SAVED · lgit commit 9f3c1a2</p>
    </div>
  );
}

function Locked({ error, onUnlock }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(error ? "Incorrect password. 4 attempts left before a 30 second wait." : null);
  const [shake, setShake] = React.useState(0);
  const [touch, setTouch] = React.useState(false);
  const submit = (v) => {
    setBusy(true); setErr(null);
    setTimeout(() => {
      if (v === "wrong" || v.length < 4) { setBusy(false); setErr("Incorrect password. 4 attempts left before a 30 second wait."); setShake(shake + 1); }
      else onUnlock();
    }, 1100);
  };
  return (
    <div className="px-lock">
      <div className="lock-top">
        <A.Mark tile size={56} />
        <h1 className="display lock-h">Unlock your vault</h1>
        <p className="small muted">Locked automatically after {VAULT_META.idle} minutes idle</p>
      </div>
      <div className="lock-form">
        <A.PasswordInput autoFocus busy={busy} error={err} shakeKey={shake} onSubmit={submit} hint={busy ? "Deriving key · Argon2id · 256 MiB" : undefined} />
        {busy && <A.Progress indeterminate label="Deriving key" />}
        <div className="or"><span>or</span></div>
        <A.Button variant="secondary" block icon="fingerprint" loading={touch} onClick={() => { setTouch(true); setTimeout(onUnlock, 1400); }}>{touch ? "Confirm Touch ID in APM" : "Unlock with Touch ID"}</A.Button>
      </div>
      <p className="lock-note caption">Your password goes to the APM app over the paired loopback bridge. The extension never keeps it.</p>
      <div className="lock-foot mono-small">{VAULT_META.cipher} · {VAULT_META.kdf}</div>
    </div>
  );
}

function Pair({ error, onDone }) {
  const [tok, setTok] = React.useState(error ? "apm_pair_7Kq2Vx9mR4tLp8Zc" : "");
  const [err, setErr] = React.useState(error ? "APM rejected this token. Tokens stop working after a rotate. Copy the current one from APM." : null);
  const [busy, setBusy] = React.useState(false);
  const go = (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    setTimeout(() => { setBusy(false); if (tok.length < 12) setErr("That token is too short. It starts with apm_pair_ and has 32 characters."); else onDone(); }, 900);
  };
  return (
    <form className="px-pair" onSubmit={go}>
      <A.Mark tile size={44} />
      <div className="pair-head">
        <h1 className="title-1">Connect to APM</h1>
        <p className="small muted">The extension fills from your vault through the APM app on this computer. It cannot open vault.dat on its own.</p>
      </div>
      <div className="pair-found"><A.Icon name="circle-check" size={16} /><span>Found {VAULT_META.app} on <span className="mono">127.0.0.1:{VAULT_META.port}</span></span></div>
      <ol className="steps">
        <li><span className="step-n">1</span><span>In APM, open <b>Settings</b>, then <b>Passkeys and extension</b>.</span></li>
        <li><span className="step-n">2</span><span>Copy the pairing token.</span></li>
        <li><span className="step-n">3</span><span>Paste it below. You do this once per browser.</span></li>
      </ol>
      <A.Input id="pair-token" label="Pairing token" placeholder="apm_pair_…" value={tok} onChange={(e) => { setTok(e.target.value); setErr(null); }} invalid={!!err} hint={err} hintTone="danger" className="mono-input" autoComplete="off" spellCheck={false} />
      <A.Button variant="primary" block type="submit" loading={busy} disabled={!tok}>Connect</A.Button>
    </form>
  );
}

function Offline({ onRetry }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="px-center">
      <A.EmptyState icon="plug" title="APM isn't running" action={<A.Button variant="primary" icon="refresh-cw" loading={busy} onClick={() => { setBusy(true); setTimeout(onRetry, 900); }}>Try again</A.Button>}>
        Open the APM app on this computer, then try again. The extension looks for it on 127.0.0.1:{VAULT_META.port} and cannot read your vault without it.
      </A.EmptyState>
      <div className="offline-meta mono-small">Last connected 2h ago · {VAULT_META.paired}</div>
    </div>
  );
}
