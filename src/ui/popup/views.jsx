import { A, cx, n, Overline, useToast, copiedToast, errorText, spaceLabel, LiveCode, SecretRow, Colorized } from "../common/kit.jsx";
import { send } from "../common/rpc.js";
import { usePopup } from "./ctx.js";
import { getType, typeIcon, SECRET_KINDS } from "../../shared/types.js";
import { agoLong, date, ago } from "../../shared/time.js";
import { generate, optionsStrength, GEN_DEFAULTS } from "../../shared/gen.js";
import { parseUrl, baseDomain } from "../../shared/domain.js";

function SubHead({ title, onBack, menu, end }) {
  return (
    <header className="px-head sub">
      <A.IconButton icon="arrow-left" label="Back" size="sm" onClick={onBack} />
      <span className="sub-title">{title}</span>
      {end}
      {menu && <A.Menu align="end" width={232} label="Item actions" trigger={<A.IconButton icon="ellipsis" label="Item actions" size="sm" />} items={menu} />}
    </header>
  );
}

const hrefOf = (v) => {
  const p = parseUrl(v);
  return p && /^https?:$/.test(p.protocol) ? p.href : null;
};

export function Detail({ id, onBack, onChanged, onGone }) {
  const { init } = usePopup();
  const push = useToast();
  const [it, setIt] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [confirm, setConfirm] = React.useState(false);
  const [moving, setMoving] = React.useState(false);
  const load = React.useCallback(async () => {
    const r = await send("item:get", { id });
    if (r.ok && r.item) setIt(r.item); else setErr(errorText(r, "This item could not be opened."));
  }, [id]);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <div className="px-sub"><SubHead title="Item" onBack={onBack} /><div className="px-body"><A.EmptyState icon="triangle-alert" title="Could not open this item">{err}</A.EmptyState></div></div>;
  if (!it) return <div className="px-sub"><SubHead title="" onBack={onBack} /><div className="px-center"><A.Spinner /></div></div>;
  const T = getType(it.type);
  const f = it.f || {};
  const secrets = it.secrets || {};
  const tab = init.tab || {};
  const isLogin = it.type === "password";
  const here = isLogin && init.matches.includes(it.id) && tab.hasForm;
  const reveal = (key) => async () => {
    const r = await send("item:reveal", { id: it.id, key });
    if (!r.ok) { push({ title: errorText(r), tone: "danger" }); return null; }
    return String(r.value == null ? "" : r.value);
  };
  const copySecret = (key, label) => async () => {
    const r = await send("copy:reveal", { id: it.id, key });
    copiedToast(push, label.toLowerCase(), r);
    return r.ok;
  };
  const copyPlain = (label, v) => async () => { copiedToast(push, label.toLowerCase(), await send("copy", { text: v })); };
  const fav = async () => {
    const r = await send("item:fav", { id: it.id, on: !it.fav });
    if (!r.ok) { push({ title: errorText(r), tone: "danger" }); return; }
    push({ title: it.fav ? "Removed from favorites" : "Added to favorites", tone: "neutral", icon: "star" });
    await load();
    onChanged();
  };
  const move = async (space) => {
    setMoving(false);
    const r = await send("item:update", { id: it.id, f: {}, space });
    if (!r.ok) { push({ title: errorText(r), tone: "danger" }); return; }
    push({ title: "Moved to " + spaceLabel(space), tone: "neutral", icon: "folder" });
    await onChanged();
    if (r.id && r.id !== it.id) { const x = await send("item:get", { id: r.id }); if (x.ok) setIt(x.item); } else await load();
  };
  const trash = async () => {
    const r = await send("item:trash", { id: it.id });
    if (!r.ok) { push({ title: errorText(r), tone: "danger" }); return; }
    push({ title: "Moved " + it.title + " to trash", tone: "neutral", icon: "trash-2" });
    onGone();
  };
  const spaces = [""].concat((init.spaces || []).map((s) => s.name)).filter((s) => s !== (it.space || ""));
  const rows = [];
  for (const def of T.fields) {
    const k = def.key;
    if (k === T.titleKey && it.type !== "contact") continue;
    if (def.kind === "file") continue;
    if (isLogin && (k === "website" || k === "urls")) continue;
    if (k in secrets) {
      if (!secrets[k]) continue;
      if (def.kind === "totp") continue;
      const colorize = def.kind === "password" || (def.kind === "secret" && !def.mono);
      rows.push(
        <SecretRow key={k} label={def.label} length={secrets[k]} mono={def.mono || def.kind === "secretBlock"} colorize={colorize} reveal={reveal(k)} copy={copySecret(k, def.label)}>
          {isLogin && k === "password" && it.health && <A.StrengthMeter score={it.health.score} bits={it.health.bits} />}
        </SecretRow>
      );
      continue;
    }
    let v = f[k];
    if (Array.isArray(v)) v = v.filter(Boolean).join(", ");
    if (typeof v === "boolean") v = v ? "Yes" : "";
    if (v == null || v === "") continue;
    const href = def.kind === "url" ? hrefOf(v) : null;
    rows.push(<A.SecretField key={k} label={def.label} value={String(v)} mono={!!def.mono} href={href || undefined} copyable={!href} onCopy={(label, val) => copyPlain(label, val)()} />);
  }
  const totpId = it.type === "totp" ? it.id : it.totpId;
  if (totpId) {
    rows.splice(isLogin ? Math.min(2, rows.length) : 0, 0,
      <div className="apm-sf" key="totp">
        <div className="apm-sf-label"><span>One-time code</span></div>
        <div className="apm-sf-body"><LiveCode fetcher={() => send("totp:get", { id: it.id })} deps={[it.id]} /></div>
        <div className="apm-sf-actions"><A.IconButton icon="copy" label="Copy one-time code" size="sm" onClick={async () => copiedToast(push, "one-time code", await send("copy:totp", { id: it.id }))} /></div>
      </div>
    );
  }
  for (const p of it.passkeyList || []) {
    rows.push(<A.SecretField key={"pk" + p.credentialId} label="Passkey" value={(p.label ? p.label + " · " : "") + (p.userName || p.rpId) + " · " + p.rpId} copyable={false} />);
  }
  const reused = it.health && it.health.reused && it.health.reused.length ? it.health.reused : null;
  const menu = [
    { label: it.fav ? "Remove from favorites" : "Add to favorites", icon: "star", onSelect: fav },
    spaces.length && { label: "Move to another space", icon: "folder", onSelect: () => setMoving(true) },
    { separator: true },
    { label: "Move to trash", icon: "trash-2", danger: true, onSelect: () => setConfirm(true) }
  ];
  return (
    <div className="px-sub">
      <SubHead title={it.title} onBack={onBack} menu={menu} />
      <div className="px-body">
        <div className="stack">
          <div className="det-hero">
            <A.ItemIcon name={it.title} icon={typeIcon(it)} src={(init.items.find((x) => x.id === it.id) || {}).icon} size="lg" />
            <div className="det-hero-text">
              <div className="title-2 det-title">{it.title}</div>
              <div className="det-meta">
                <span>{spaceLabel(it.space || "")} · {T.label}</span>
                {it.fav && <A.Badge size="sm" icon="star">Favorite</A.Badge>}
                {reused && <A.Badge tone="warning" icon="triangle-alert" size="sm">Reused</A.Badge>}
                {it.health && it.health.weak && <A.Badge tone="warning" icon="triangle-alert" size="sm">Weak</A.Badge>}
              </div>
            </div>
          </div>
          {confirm && (
            <A.Callout tone="danger" icon="trash-2" title={"Move " + it.title + " to trash?"} action={<><A.Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</A.Button><A.Button size="sm" variant="danger" onClick={trash}>Move</A.Button></>}>
              You can restore it from Trash in the APM app.
            </A.Callout>
          )}
          {moving && (
            <div className="move-row">
              <A.Select id="move-space" size="sm" label="Move to" value="" onChange={(v) => v !== "__" && move(v)} options={[{ value: "__", label: "Choose a space" }].concat(spaces.map((s) => ({ value: s, label: spaceLabel(s) })))} />
              <A.Button size="sm" variant="ghost" onClick={() => setMoving(false)}>Cancel</A.Button>
            </div>
          )}
          {rows.length > 0 ? <A.FieldGroup className="fg-compact">{rows}</A.FieldGroup> : <p className="hint">{T.label} items with files open in the APM app.</p>}
          {isLogin && <Sites it={it} tab={tab} onChanged={async () => { await load(); await onChanged(); }} />}
          {reused && <p className="hint warn-hint"><A.Icon name="triangle-alert" size={14} />Same password as {reused.join(", ")}. Change it on the site and APM offers to update this login.</p>}
          <div className="det-foot mono-small">{[it.modified ? "Changed " + agoLong(it.modified) : "", it.created ? "Created " + date(it.created) : "", it.used ? "Used " + agoLong(it.used) : ""].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      {isLogin && (
        <div className="px-bar">
          {secrets.password ? <A.Button variant={here ? "secondary" : "primary"} block={!here} icon="copy" onClick={copySecret("password", "Password")}>Copy password</A.Button> : null}
          {here && <A.Button variant="primary" block onClick={async () => { const r = await send("fill:item", { id: it.id }); if (r.ok) window.close(); else push({ title: errorText(r), tone: "danger" }); }}>Fill on {tab.host}</A.Button>}
        </div>
      )}
    </div>
  );
}

function siteLabel(u) {
  const p = parseUrl(u);
  if (!p) return u;
  return p.protocol === "https:" ? p.host.replace(/^www\./, "") : p.origin;
}

function Sites({ it, tab, onChanged }) {
  const push = useToast();
  const f = it.f || {};
  const list = [f.website].concat(Array.isArray(f.urls) ? f.urls : []).map((x) => String(x || "").trim()).filter(Boolean);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const hereListed = tab.web && list.some((u) => { const a = parseUrl(u); const b = parseUrl(tab.url); return a && b && a.host.replace(/^www\./, "") === b.host.replace(/^www\./, ""); });
  const add = async (url) => {
    setBusy(true);
    setErr(null);
    const r = await send("site:add", { id: it.id, url });
    setBusy(false);
    if (!r.ok) { setErr(errorText(r)); return; }
    setAdding(false);
    setDraft("");
    push({ title: r.unchanged ? "Already saved for this login" : "Added " + r.site, tone: r.unchanged ? "neutral" : "success" });
    if (!r.unchanged) onChanged();
  };
  const remove = async (u) => {
    const r = await send("site:remove", { id: it.id, url: u });
    if (!r.ok) { push({ title: errorText(r), tone: "danger" }); return; }
    push({ title: "Removed " + siteLabel(u), tone: "neutral", icon: "trash-2" });
    onChanged();
  };
  return (
    <section className="sect">
      <Overline count={list.length || undefined} action={!adding && <button type="button" className="ovl-action" onClick={() => { setAdding(true); setErr(null); }}><A.Icon name="plus" size={12} />Add</button>}>Websites</Overline>
      <div className="sites">
        {list.map((u) => {
          const href = hrefOf(u);
          return (
            <div key={u} className="site-row">
              <A.Icon name="globe" size={14} />
              {href ? <a className="site-link" href={href} target="_blank" rel="noreferrer">{siteLabel(u)}</a> : <span className="site-link">{u}</span>}
              <A.IconButton icon="x" label={"Remove " + siteLabel(u)} size="xs" onClick={() => remove(u)} />
            </div>
          );
        })}
        {!list.length && !adding && <p className="hint">No website yet. APM fills this login only on the sites listed here.</p>}
        {tab.web && !hereListed && !adding && (
          <button type="button" className="site-row site-add-here" onClick={() => add(tab.url)} disabled={busy}>
            <A.Icon name="plus" size={14} /><span className="site-link">Add {tab.host}</span>
          </button>
        )}
        {adding && (
          <form className="site-new" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) add(draft.trim()); }}>
            <A.Input id="site-new" size="sm" value={draft} onChange={(e) => { setDraft(e.target.value); setErr(null); }} placeholder="example.com" icon="globe" invalid={!!err} autoFocus aria-label="Website" />
            <A.Button size="sm" variant="ghost" onClick={() => { setAdding(false); setErr(null); }}>Cancel</A.Button>
            <A.Button size="sm" variant="primary" type="submit" loading={busy} disabled={!draft.trim()}>Add</A.Button>
          </form>
        )}
        {err && <p className="hint warn-hint"><A.Icon name="circle-alert" size={14} />{err}</p>}
      </div>
    </section>
  );
}

function titleFromHost(host) {
  const b = baseDomain(host || "") || host || "";
  const s = b.split(".")[0] || "";
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function NewLogin({ onBack, onSaved }) {
  const { init } = usePopup();
  const tab = init.tab || {};
  const [name, setName] = React.useState(titleFromHost(tab.host));
  const [urls, setUrls] = React.useState([tab.host || ""]);
  const [user, setUser] = React.useState("");
  const [pw, setPw] = React.useState(() => generate(Object.assign({}, GEN_DEFAULTS, init.gen || {})));
  const [shown, setShown] = React.useState(false);
  const [space, setSpace] = React.useState(init.space && init.space !== "all" ? init.space : init.settings.saveSpace && init.settings.saveSpace !== "ask" ? init.settings.saveSpace : "");
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { send("probe").then((r) => { if (r && r.username) setUser((u) => u || r.username); }); }, []);
  const s = optionsStrength(pw);
  const spaces = [""].concat((init.spaces || []).map((x) => x.name));
  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr("Give the login a name."); return; }
    setBusy(true);
    setErr(null);
    const sites = urls.map((u) => u.trim()).filter(Boolean);
    const r = await send("item:add", { type: "password", space, f: { account: name.trim(), username: user.trim(), password: pw, website: sites[0] || "", urls: sites.slice(1) } });
    setBusy(false);
    if (!r.ok) { setErr(r.code === "exists" ? "A login called " + name.trim() + " already exists in " + spaceLabel(space) + ". Choose another name." : errorText(r)); return; }
    onSaved(r.item || { title: name.trim(), space });
  };
  return (
    <div className="px-sub">
      <SubHead title="New login" onBack={onBack} />
      <div className="px-body">
        <form className="form" id="new-login" onSubmit={save}>
          <A.Input id="nl-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!name} />
          <div className="url-list">
            {urls.map((u, i) => (
              <div key={i} className="url-row">
                <A.Input id={"nl-url-" + i} label={i === 0 ? "Websites" : undefined} aria-label={i === 0 ? undefined : "Website " + (i + 1)} value={u} onChange={(e) => { const v = e.target.value; setUrls((x) => x.map((y, j) => (j === i ? v : y))); }} icon="globe" placeholder="example.com" autoFocus={i > 0 && !u} />
                {urls.length > 1 && <A.IconButton icon="x" label="Remove website" size="sm" onClick={() => setUrls((x) => x.filter((_, j) => j !== i))} />}
              </div>
            ))}
            <button type="button" className="linkbtn url-more" onClick={() => setUrls((x) => x.concat([""]))}>Add another website</button>
          </div>
          <A.Input id="nl-user" label="Username" value={user} onChange={(e) => setUser(e.target.value)} icon="user" placeholder="you@example.com" autoFocus={!!name} />
          <div className="pw-field">
            <A.Input id="nl-pw" label="Password" type={shown ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} className="mono-input" trailing={<><A.IconButton icon={shown ? "eye-off" : "eye"} label={shown ? "Hide" : "Reveal"} size="xs" onClick={() => setShown(!shown)} /><A.IconButton icon="dices" label="Generate password" size="xs" onClick={() => setPw(generate(Object.assign({}, GEN_DEFAULTS, init.gen || {})))} /></>} />
            <A.StrengthMeter key={pw} score={s.score} bits={s.bits} detail={s.detail} />
          </div>
          <A.Select id="nl-space" label="Space" value={space} onChange={setSpace} options={spaces.map((x) => ({ value: x, label: spaceLabel(x) }))} />
          {err && <A.Callout tone="danger" icon="circle-alert">{err}</A.Callout>}
        </form>
      </div>
      <div className="px-bar">
        <A.Button variant="ghost" onClick={onBack}>Cancel</A.Button>
        <A.Button variant="primary" block type="submit" form="new-login" loading={busy}>Save login</A.Button>
      </div>
    </div>
  );
}

export function Passkeys({ onBack, onOpen }) {
  const push = useToast();
  const [q, setQ] = React.useState("");
  const [list, setList] = React.useState(null);
  const [renaming, setRenaming] = React.useState(null);
  const [removing, setRemoving] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const load = React.useCallback(async () => {
    const r = await send("passkeys:list");
    setList(r.ok ? r.passkeys || [] : []);
    if (!r.ok) push({ title: errorText(r), tone: "danger" });
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const all = (list || []).filter((p) => !q || [p.rpId, p.userName, p.entryName, p.label].join(" ").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="px-sub">
      <SubHead title="Passkeys" onBack={onBack} end={list ? <span className="sub-count">{list.length}</span> : null} />
      <div className="px-body">
        <div className="stack tight">
          <A.SearchField size="sm" value={q} onChange={setQ} placeholder="Search passkeys" shortcut={null} />
          {!list && <div className="px-center"><A.Spinner /></div>}
          {all.map((p) => (
            <div key={p.credentialId} className="pk-item">
              {renaming === p.credentialId ? (
                <form className="pk-rename" onSubmit={async (e) => { e.preventDefault(); const r = await send("passkeys:rename", { credentialId: p.credentialId, label: draft }); setRenaming(null); if (r.ok) { push({ title: "Renamed passkey" }); load(); } else push({ title: errorText(r), tone: "danger" }); }}>
                  <A.Input id={"rn-" + p.credentialId.slice(0, 8)} size="sm" value={draft} autoFocus maxLength={120} placeholder="MacBook Pro" onChange={(e) => setDraft(e.target.value)} />
                  <A.Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</A.Button>
                  <A.Button size="sm" variant="primary" type="submit" disabled={!draft.trim()}>Save</A.Button>
                </form>
              ) : (
                <div className="pk-row">
                  <A.ItemIcon icon="fingerprint" />
                  <span className="row-text"><span className="row-title">{p.rpId}{p.label ? " · " + p.label : ""}</span><span className="row-sub">{p.userName || "No user name"} · in {p.entryName}, {spaceLabel(p.space || "")}</span></span>
                  <span className="row-time">{p.lastUsedAt ? ago(typeof p.lastUsedAt === "number" ? p.lastUsedAt : Date.parse(p.lastUsedAt)) : "new"}</span>
                  <A.Menu align="end" width={200} label="Passkey actions" trigger={<A.IconButton icon="ellipsis" label="Passkey actions" size="xs" />} items={[
                    { label: "Rename", icon: "pencil", onSelect: () => { setDraft(p.label || ""); setRenaming(p.credentialId); } },
                    p.entryId && { label: "Open " + p.entryName, icon: "arrow-right", onSelect: () => onOpen(p.entryId) },
                    { separator: true },
                    { label: "Remove", icon: "trash-2", danger: true, onSelect: () => setRemoving(p.credentialId) }
                  ]} />
                </div>
              )}
              {removing === p.credentialId && (
                <A.Callout tone="danger" icon="trash-2" title={"Remove the passkey for " + p.rpId + "?"} action={<><A.Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancel</A.Button><A.Button size="sm" variant="danger" onClick={async () => { const r = await send("passkeys:remove", { credentialId: p.credentialId }); setRemoving(null); if (r.ok) { push({ title: "Removed passkey for " + p.rpId, tone: "neutral", icon: "trash-2" }); load(); } else push({ title: errorText(r), tone: "danger" }); }}>Remove</A.Button></>}>
                  {p.rpId} still trusts it. Remove it in the site's security settings too.
                </A.Callout>
              )}
            </div>
          ))}
          {list && !all.length && <A.EmptyState icon="fingerprint" title={list.length ? "No passkeys match" : "No passkeys yet"}>{list.length ? "Search looks at sites, user names and items." : "When a site offers to create a passkey, APM saves it to your vault instead of this browser."}</A.EmptyState>}
          <p className="hint mono-small">ES256 · P-256 keys that never leave the APM app</p>
        </div>
      </div>
    </div>
  );
}
