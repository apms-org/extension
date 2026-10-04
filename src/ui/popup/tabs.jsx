import { A, cx, n, Overline, useToast, copiedToast, errorText, spaceLabel, LiveCode, GenPanel } from "../common/kit.jsx";
import { send } from "../common/rpc.js";
import { usePopup } from "./ctx.js";
import { getType, typeIcon, FILTERS } from "../../shared/types.js";
import { ago, group, GROUPS } from "../../shared/time.js";

export function SiteTab({ matches, others, onOpen, onNew }) {
  const { init, reload } = usePopup();
  const push = useToast();
  const tab = init.tab || {};
  const [confirm, setConfirm] = React.useState(null);
  const [linking, setLinking] = React.useState(false);
  if (!tab.web) {
    return <A.EmptyState icon="globe" title="No website in this tab">Open a site to see its logins here. Everything else is in Vault.</A.EmptyState>;
  }
  const reused = matches.find((i) => i.health && i.health.reused && i.health.reused.length);
  const weak = !reused && matches.find((i) => i.health && i.health.weak);
  const fill = async (it, force) => {
    const r = await send("fill:item", { id: it.id, force: !!force });
    if (r.ok) { window.close(); return; }
    if (r.code === "mismatch") { setConfirm(it); return; }
    push({ title: errorText(r), tone: "danger" });
  };
  const remember = async (it, thenFill) => {
    const r = await send("site:add", { id: it.id });
    if (!r.ok) { push({ title: errorText(r), tone: "danger" }); return; }
    setConfirm(null);
    setLinking(false);
    if (thenFill) { await fill(it, true); return; }
    await reload();
    push({ title: it.title + " now works on " + tab.host });
  };
  const paused = !!init.rule;
  if (linking) return <LinkLogin host={tab.host} exclude={matches.map((i) => i.id)} onPick={(it) => remember(it, false)} onCancel={() => setLinking(false)} />;
  return (
    <div className="stack">
      <div className="site-head">
        <span className="site-tile"><A.Icon name={paused ? "shield-off" : "globe-lock"} size={16} /></span>
        <span className="site-text"><span className="site-host">{tab.host}</span><span className="site-sub">{paused ? "APM is paused on this site" : matches.length ? n(matches.length, "login") + " for this site" : "Nothing saved for this site yet"}</span></span>
        <A.Button size="sm" variant="ghost" icon="plus" onClick={onNew}>New</A.Button>
      </div>
      {paused && <A.Callout tone="neutral" icon="shield-off" title="Paused on this site" action={<A.Button size="sm" variant="secondary" onClick={async () => { await send("site:resume"); reload(); }}>Resume</A.Button>}>APM won't fill or offer to save here until you resume it.</A.Callout>}
      {confirm && (
        <A.Callout tone="warning" title={"Fill " + confirm.title + " on " + tab.host + "?"} action={<><A.Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</A.Button><A.Button size="sm" variant="ghost" onClick={() => fill(confirm, true)}>Fill once</A.Button><A.Button size="sm" variant="secondary" onClick={() => remember(confirm, true)}>Fill and remember</A.Button></>}>
          This login is saved for a different website. Only continue if you trust this page. Fill and remember adds {tab.host} to the login.
        </A.Callout>
      )}
      {reused && (
        <A.Callout tone="warning" title="Reused password">
          {reused.username || reused.title} shares its password with {reused.health.reused.join(" and ")}. If one leaks, all of them are exposed.
        </A.Callout>
      )}
      {weak && <A.Callout tone="warning" title="Weak password">{weak.username || weak.title} has a password that is easy to guess. Change it on {tab.host}, and APM offers to update the login.</A.Callout>}
      {matches.length > 0 && <section className="sect">
        <Overline count={matches.length}>Logins</Overline>
        <div className="matches">
          {matches.map((it, i) => <Match key={it.id} it={it} primary={i === 0 && tab.hasForm} onOpen={() => onOpen(it.id)} onFill={() => fill(it)} canFill={tab.hasForm} push={push} />)}
        </div>
      </section>}
      {others.length > 0 && <section className="sect">
        <Overline count={others.length}>Also for this site</Overline>
        {others.map((it) => <A.ItemRow key={it.id} title={it.title} subtitle={it.sub} icon={typeIcon(it)} src={it.icon} time={ago(it.used)} onClick={() => onOpen(it.id)} />)}
      </section>}
      {!matches.length && !others.length && <A.EmptyState icon="globe" title={"Nothing saved for " + tab.host}>Sign in as usual and APM offers to save the login, or save it now.</A.EmptyState>}
      <A.Button variant="secondary" block icon="plus" onClick={onNew}>Save a login for {tab.host}</A.Button>
      <button type="button" className="linkbtn" onClick={() => setLinking(true)}>Use a saved login on {tab.host}</button>
    </div>
  );
}

function LinkLogin({ host, exclude, onPick, onCancel }) {
  const { init } = usePopup();
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(null);
  const skip = new Set(exclude);
  const logins = init.items.filter((i) => i.type === "password" && !skip.has(i.id));
  const t = q.trim().toLowerCase();
  const shown = (t ? logins.filter((i) => (i.title + " " + (i.username || "") + " " + (i.urls || []).join(" ")).toLowerCase().includes(t)) : logins).slice(0, 60);
  return (
    <div className="stack">
      <div className="site-head">
        <span className="site-tile"><A.Icon name="link-2" size={16} /></span>
        <span className="site-text"><span className="site-host">Use a login on {host}</span><span className="site-sub">APM adds {host} to the login you pick</span></span>
        <A.Button size="sm" variant="ghost" onClick={onCancel}>Cancel</A.Button>
      </div>
      <A.SearchField size="sm" value={q} onChange={setQ} placeholder="Search logins" shortcut={null} autoFocus />
      <div className="sect">
        {shown.map((i) => <A.ItemRow key={i.id} title={i.title} src={i.icon} subtitle={[i.username, (i.urls || [])[0]].filter(Boolean).join(" · ")} time={busy === i.id ? "Adding" : undefined} onClick={async () => { setBusy(i.id); await onPick(i); setBusy(null); }} />)}
        {!shown.length && <A.EmptyState icon="search" title="No logins match">Search looks at names, usernames and websites.</A.EmptyState>}
      </div>
    </div>
  );
}

function Match({ it, primary, onOpen, onFill, canFill, push }) {
  const codeRef = React.useRef("");
  const sub = [spaceLabel(it.space || ""), it.passkeys ? "Passkey" : "", it.fav ? "Favorite" : ""].filter(Boolean).join(" · ");
  return (
    <div className="match">
      <div className="match-top">
        <button type="button" className="match-main" onClick={onOpen}>
          <A.ItemIcon name={it.title} src={it.icon} />
          <span className="row-text">
            <span className="row-title">{it.username || it.title}</span>
            <span className="row-sub">{it.username ? it.title + " · " + sub : sub}</span>
          </span>
        </button>
        <div className="match-actions">
          {it.username && <A.IconButton icon="user" label="Copy username" size="sm" onClick={async () => copiedToast(push, "username", await send("copy", { text: it.username }))} />}
          <A.IconButton icon="key-round" label="Copy password" size="sm" onClick={async () => copiedToast(push, "password", await send("copy:reveal", { id: it.id, key: "password" }))} />
          {canFill && <A.Button size="sm" variant={primary ? "primary" : "secondary"} onClick={onFill}>Fill</A.Button>}
        </div>
      </div>
      {it.totpId && (
        <div className="match-code">
          <span className="match-code-label"><A.Icon name="timer" size={14} />One-time code</span>
          <LiveCode fetcher={() => send("totp:get", { id: it.id })} deps={[it.id]} onCode={(c) => { codeRef.current = c; }} />
          <A.IconButton icon="copy" label="Copy one-time code" size="xs" onClick={async () => copiedToast(push, "one-time code", await send("copy", { text: codeRef.current, secret: true }))} />
        </div>
      )}
    </div>
  );
}

export function VaultTab({ items, onOpen, onNew }) {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState("all");
  const t = q.trim().toLowerCase();
  const hits = items.filter((i) => (type === "all" || i.type === type || (type === "fav" && i.fav)) && (!t || [i.title, i.sub, i.username, (i.urls || []).join(" "), getType(i.type).label, i.space || "default"].join(" ").toLowerCase().includes(t)));
  const present = FILTERS.filter((k) => items.some((i) => i.type === k));
  const typeOpts = [{ value: "all", label: "All types" }, { value: "fav", label: "Favorites  " + items.filter((i) => i.fav).length }].concat(present.map((k) => ({ value: k, label: getType(k).plural + "  " + items.filter((i) => i.type === k).length })));
  const ts = (i) => i.used || i.modified || i.created || 0;
  const sorted = hits.slice().sort((a, b) => ts(b) - ts(a));
  return (
    <div className="vault">
      <div className="vault-tools">
        <A.SearchField size="sm" value={q} onChange={setQ} placeholder={"Search " + n(items.length, "item")} shortcut={null} autoFocus />
        <A.Select id="vault-type" size="sm" icon="list-filter" value={type} onChange={setType} options={typeOpts} />
      </div>
      {!items.length && <A.EmptyState icon="layers" title="This space is empty" action={<A.Button size="sm" variant="secondary" icon="plus" onClick={onNew}>New login</A.Button>}>Add items in the APM app, or save a login here.</A.EmptyState>}
      {items.length > 0 && !hits.length && (
        <A.EmptyState icon="search" title={q ? "No matches for \"" + q + "\"" : "Nothing of this type"} action={<A.Button size="sm" variant="secondary" icon="plus" onClick={onNew}>New login</A.Button>}>
          Search looks at names, usernames, websites, types and spaces.
        </A.EmptyState>
      )}
      {GROUPS.map((g) => {
        const rows = sorted.filter((i) => group(ts(i)) === g);
        if (!rows.length) return null;
        return (
          <section key={g} className="vgroup">
            <div className="vgroup-head"><span>{g}</span><span className="ovl-count">{rows.length}</span></div>
            {rows.map((it) => <A.ItemRow key={it.id} title={it.title} subtitle={it.sub} icon={typeIcon(it)} src={it.icon} time={ago(ts(it))} favorite={it.fav} alert={it.health && (it.health.weak || (it.health.reused && it.health.reused.length)) ? "warning" : undefined} mono={it.type === "cloud" || it.type === "ssh_config"} onClick={() => onOpen(it.id)} />)}
          </section>
        );
      })}
    </div>
  );
}

export function CodesTab({ space }) {
  const { init } = usePopup();
  const push = useToast();
  const [q, setQ] = React.useState("");
  const [list, setList] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const load = React.useCallback(async () => {
    const r = await send("totp:list");
    if (r.ok) { setList({ codes: r.codes || [], offset: (r.now || Date.now()) - Date.now() }); setErr(null); } else setErr(errorText(r));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const [, tick] = React.useState(0);
  const busy = React.useRef(false);
  React.useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(id); }, []);
  React.useEffect(() => {
    if (!list || busy.current) return;
    const now = Math.floor((Date.now() + list.offset) / 30000);
    if (list.codes.some((c) => now > c.step)) { busy.current = true; load().finally(() => { busy.current = false; }); }
  });
  if (err) return <A.EmptyState icon="triangle-alert" title="Codes could not load" action={<A.Button size="sm" variant="secondary" onClick={load}>Try again</A.Button>}>{err}</A.EmptyState>;
  if (!list) return <div className="px-center"><A.Spinner /></div>;
  const step = Math.floor((Date.now() + list.offset) / 30000);
  const host = init.tab && init.tab.web ? init.tab.host : "";
  const t = q.trim().toLowerCase();
  const codes = list.codes.filter((c) => (space === "all" || (c.space || "") === space) && (!t || (c.title + " " + (c.domain || "")).toLowerCase().includes(t)));
  const matchIds = new Set();
  const linked = new Set(init.items.filter((i) => init.matches.includes(i.id) && i.totpId).map((i) => i.totpId));
  const here = codes.filter((c) => linked.has(c.id) || (host && c.domain && (host === c.domain || host.endsWith("." + c.domain.replace(/^www\./, "")))));
  here.forEach((c) => matchIds.add(c.id));
  const rest = codes.filter((c) => !matchIds.has(c.id));
  const copyCode = async (c) => {
    const code = step === c.step ? c.code : c.next;
    copiedToast(push, c.title + " code", await send("copy", { text: code, secret: true }));
  };
  const Row = ({ c }) => {
    const code = step === c.step ? c.code : step === c.step + 1 ? c.next : "";
    return (
      <div className="code-row" onClick={() => copyCode(c)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") copyCode(c); }} title="Click to copy">
        <A.ItemIcon name={c.title} src={(init.items.find((x) => x.id === c.id) || {}).icon} />
        <span className="row-text"><span className="row-title">{c.title}</span><span className="row-sub">{c.domain || c.sub || spaceLabel(c.space || "")}</span></span>
        {code ? <A.TotpCode key={code} code={code} /> : <span className="code-wait mono">··· ···</span>}
      </div>
    );
  };
  return (
    <div className="stack tight">
      <A.SearchField size="sm" value={q} onChange={setQ} placeholder={"Search " + n(list.codes.length, "code")} shortcut={null} />
      {here.length > 0 && <section className="sect"><Overline count={here.length}>For {host}</Overline>{here.map((c) => <Row key={c.id} c={c} />)}</section>}
      {rest.length > 0 && <section className="sect"><Overline count={rest.length}>{here.length ? "All codes" : "Codes"}</Overline>{rest.map((c) => <Row key={c.id} c={c} />)}</section>}
      {!codes.length && <A.EmptyState icon="timer" title={list.codes.length ? "No codes match \"" + q + "\"" : "No one-time codes yet"}>{list.codes.length ? "Search looks at names and websites." : "Add an authenticator in the APM app with its setup key, and its codes show up here."}</A.EmptyState>}
    </div>
  );
}

export function GenTab() {
  const { init } = usePopup();
  const push = useToast();
  const tab = init.tab || {};
  const save = React.useRef(null);
  const onChange = (o) => { clearTimeout(save.current); save.current = setTimeout(() => send("gen:set", { gen: o }), 300); };
  return (
    <div className="stack">
      <GenPanel initial={init.gen} onChange={onChange}
        onCopy={async (v) => copiedToast(push, "password", await send("copy", { text: v, secret: true }))}
        onUse={tab.hasPassword ? async (v) => { const r = await send("fill:password", { value: v }); if (r.ok) { await send("copy", { text: v, secret: true }); window.close(); } else push({ title: errorText(r), tone: "danger" }); } : null}
        useLabel={"Fill on " + (tab.host || "this page")} />
      <p className="hint mono-small">Made in this browser with crypto.getRandomValues. Nothing leaves it until you save a login.</p>
    </div>
  );
}
