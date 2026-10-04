import { A, cx, Colorized, errorText, spaceLabel } from "../common/kit.jsx";
import { framePort, sessionFromHash, watchSize } from "../common/rpc.js";
import { agoLong, n } from "../../shared/time.js";

const session = sessionFromHash();

function App() {
  const [data, setData] = React.useState(null);
  const port = React.useRef(null);
  const root = React.useRef(null);

  React.useEffect(() => {
    port.current = framePort(session, {
      init: (m) => { if (!m.data || !m.data.ok) { port.current.close(); return; } setData(m.data); }
    });
    const onKey = (e) => { if (e.key === "Escape") port.current.close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!data || !root.current) return;
    return watchSize(root.current, port.current);
  }, [!!data]);

  if (!data) return <div className="pr" ref={root} />;
  const p = port.current;
  const reinit = async () => { const x = await p.ask("reinit"); if (x.ok) setData(x); return x; };
  return (
    <div className={cx("pr", "pr-" + data.kind)} ref={root}>
      {data.kind === "save" && <Save data={data} port={p} />}
      {data.kind === "update" && <Update data={data} port={p} />}
      {data.kind === "create" && <PasskeyCreate data={data} port={p} reinit={reinit} />}
      {data.kind === "get" && <PasskeyGet data={data} port={p} reinit={reinit} />}
      {data.kind === "toast" && <Toast data={data} port={p} />}
    </div>
  );
}

function Shell({ title, sub, onClose, children, foot }) {
  return (
    <div className="np" role="dialog" aria-label={title}>
      <div className="np-head">
        <A.Mark tile size={28} />
        <span className="row-text"><span className="np-title">{title}</span>{sub && <span className="row-sub">{sub}</span>}</span>
        <A.IconButton icon="x" label="Close" size="sm" onClick={onClose} />
      </div>
      {children && <div className="np-body">{children}</div>}
      <div className="np-foot">{foot}</div>
    </div>
  );
}

function Masked({ port, length }) {
  const [v, setV] = React.useState(null);
  const [shown, setShown] = React.useState(false);
  const toggle = async () => {
    if (shown) { setShown(false); return; }
    if (v == null) {
      const r = await port.ask("reveal");
      if (!r.ok) return;
      setV(r.password);
    }
    setShown(true);
  };
  return (
    <div className="np-pw">
      <span className="np-pw-label small">Password</span>
      <span className="np-pw-v mono">{shown && v != null ? <Colorized value={v} /> : "•".repeat(Math.min(Math.max(length || 12, 8), 18))}</span>
      <A.IconButton icon={shown ? "eye-off" : "eye"} label={shown ? "Hide" : "Reveal"} size="xs" onClick={toggle} />
    </div>
  );
}

function NotNow({ port, host, label }) {
  const never = async () => {
    const r = await port.ask("never");
    if (r.ok) port.tell("toast", { title: "APM won't offer to save on " + r.host, description: "Undo this in the extension settings, under Excluded sites.", tone: "neutral" });
    port.close();
  };
  return (
    <A.Menu side="top" width={232} label="More" trigger={<A.Button size="sm" variant="ghost" iconRight="chevron-down">{label || "Not now"}</A.Button>} items={[
      { label: "Not now", icon: "x", onSelect: async () => { await port.ask("dismiss"); port.close(); } },
      { label: "Never for " + host, icon: "shield-off", onSelect: never }
    ]} />
  );
}

function Save({ data, port }) {
  const [name, setName] = React.useState(data.name || "");
  const [user, setUser] = React.useState(data.username || "");
  const [space, setSpace] = React.useState(data.space || "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const spaces = [""].concat((data.spaces || []).map((s) => s.name).filter(Boolean));
  const taken = (data.takenNames || []).some((t) => t.title.toLowerCase() === name.trim().toLowerCase() && t.space === space);
  const save = async (e) => {
    if (e) e.preventDefault();
    if (!name.trim()) { setErr("Give the login a name."); return; }
    setBusy(true);
    setErr(null);
    const r = await port.ask("save", { name: name.trim(), username: user, space });
    setBusy(false);
    if (!r.ok) { setErr(r.code === "exists" ? "A login called " + name.trim() + " already exists in " + spaceLabel(space) + ". Pick another name." : errorText(r)); return; }
    port.tell("toast", { title: "Saved " + name.trim() + " to " + spaceLabel(space), description: "APM fills it next time you sign in." });
    port.close();
  };
  return (
    <form onSubmit={save}>
      <Shell title={"Save login for " + data.host + "?"} sub="You just signed in. APM can fill it next time." onClose={() => port.close()} foot={<>
        <NotNow port={port} host={data.host} />
        <span className="np-spacer" />
        <A.Button size="sm" variant="primary" type="submit" loading={busy}>Save</A.Button>
      </>}>
        <div className="np-grid">
          <A.Input id="sp-name" size="sm" label="Name" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} invalid={taken} autoFocus />
          <A.Select id="sp-space" size="sm" label="Space" value={space} onChange={setSpace} options={spaces.map((s) => ({ value: s, label: spaceLabel(s) }))} />
        </div>
        <A.Input id="sp-user" size="sm" label="Username" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" spellCheck={false} />
        <Masked port={port} length={data.passwordLength} />
        {taken && !err && <p className="caption np-warn"><A.Icon name="triangle-alert" size={14} />{spaceLabel(space)} already has a login called {name.trim()}.</p>}
        {err && <p className="caption np-err"><A.Icon name="circle-alert" size={14} />{err}</p>}
      </Shell>
    </form>
  );
}

function Update({ data, port }) {
  const it = data.item;
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const reused = Array.isArray(it.reused) ? it.reused : [];
  const st = data.strength || { score: 0 };
  const label = ["Very weak", "Weak", "Fair", "Strong", "Very strong"][st.score] || "Strong";
  const update = async () => {
    setBusy(true);
    setErr(null);
    const r = await port.ask("update");
    setBusy(false);
    if (!r.ok) { setErr(errorText(r)); return; }
    port.tell("toast", { title: "Updated " + it.title, description: "The old password stays in the item's history." });
    port.close();
  };
  return (
    <Shell title={"Update the password for " + (it.username || it.title) + "?"} sub={it.title + " · " + spaceLabel(it.space || "")} onClose={() => port.close()} foot={<>
      <NotNow port={port} host={data.host} />
      <span className="np-spacer" />
      <A.Button size="sm" variant="primary" loading={busy} onClick={update}>Update</A.Button>
    </>}>
      <div className="np-diff">
        <div className="np-diff-row">
          <span className="small muted">Saved</span>
          <span className="mono np-old">••••••••••••••••</span>
          {reused.length > 0 ? <A.Badge tone="warning" size="sm" icon="triangle-alert">Reused on {reused.length === 1 ? reused[0] : n(reused.length, "item")}</A.Badge> : it.weak ? <A.Badge tone="warning" size="sm" icon="triangle-alert">Weak</A.Badge> : null}
        </div>
        <div className="np-diff-row">
          <span className="small muted">New</span>
          <span className="mono">{"•".repeat(Math.min(Math.max(data.passwordLength || 12, 8), 18))}</span>
          <A.Badge tone={st.score >= 3 ? "success" : "warning"} size="sm" icon={st.score >= 3 ? "shield-check" : "triangle-alert"}>{label}</A.Badge>
        </div>
      </div>
      <p className="caption muted">{it.modified ? "The saved password was set " + agoLong(it.modified) + ". " : ""}APM keeps the old one in the item's history.</p>
      {err && <p className="caption np-err"><A.Icon name="circle-alert" size={14} />{err}</p>}
    </Shell>
  );
}

function SheetFrame({ title, children, onCancel }) {
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <div className="sheet-head">
        <A.Mark tile size={32} />
        <A.IconButton icon="x" label="Cancel" size="sm" onClick={onCancel} />
      </div>
      {children}
    </div>
  );
}

function useUnlockWatch(locked, reinit) {
  React.useEffect(() => {
    if (!locked) return;
    const id = setInterval(async () => { await reinit(); }, 1500);
    return () => clearInterval(id);
  }, [locked]);
}

function LockedSheet({ data, port, what, cancel }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const touch = data.touchId && data.touchId.available && data.touchId.configured;
  const touchId = async () => {
    setBusy(true);
    setErr(null);
    const r = await port.ask("touchid");
    setBusy(false);
    if (!r.ok) setErr(r.code === "touchid_failed" ? "Touch ID was cancelled or did not match." : errorText(r));
  };
  const openPopup = async () => {
    const r = await port.ask("open-popup");
    if (!r.ok) setErr("Click the APM icon in the toolbar to unlock.");
  };
  return (
    <>
      <div className="sheet-locked">
        <span className="im-lock-ic"><A.Icon name="lock" size={16} /></span>
        <span className="row-text"><span className="row-title">APM is locked</span><span className="im-lock-body">Unlock APM to {what}. This sheet picks up as soon as it is unlocked.</span></span>
      </div>
      {err && <p className="caption np-err"><A.Icon name="circle-alert" size={14} />{err}</p>}
      <div className="sheet-foot">
        <A.Button variant="ghost" size="sm" onClick={cancel}>{data.kind === "create" ? "Use this browser instead" : "Use another device"}</A.Button>
        <span className="np-spacer" />
        {touch
          ? <A.Button variant="primary" icon="fingerprint" loading={busy} onClick={touchId}>Unlock with Touch ID</A.Button>
          : <A.Button variant="primary" icon="lock-open" onClick={openPopup}>Unlock in the toolbar</A.Button>}
      </div>
    </>
  );
}

function PickRow({ it, on, onClick, children }) {
  const body = [
    <A.ItemIcon key="i" name={it.title} src={it.icon || undefined} />,
    <span key="t" className="row-text"><span className="row-title">{it.title}</span><span className="row-sub">{it.username || "No username"} · {spaceLabel(it.space || "")}{it.passkeys ? " · " + n(it.passkeys, "passkey") : ""}</span></span>
  ];
  if (children) return <div className="pick is-on static">{body}{children}</div>;
  return (
    <button type="button" className={cx("pick", on && "is-on")} onClick={onClick}>
      {body}
      <span className="pick-mark">{on && <A.Icon name="check" size={14} strokeWidth={2.25} />}</span>
    </button>
  );
}

function PasskeyCreate({ data, port, reinit }) {
  useUnlockWatch(!data.unlocked, reinit);
  const suggested = data.suggested || [];
  const [pick, setPick] = React.useState(() => (suggested[0] ? suggested[0].id : "new"));
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [done, setDone] = React.useState(null);
  const [space, setSpace] = React.useState(data.defaultSpace || "");
  const siteTitle = data.rpName || data.rpId;
  const userName = data.user.name || data.user.displayName || "";
  React.useEffect(() => { if (data.unlocked && pick === "new" && suggested[0]) setPick(suggested[0].id); }, [data.unlocked]);
  const cancel = async () => { await port.ask("pk-fallback"); port.close(); };
  const abort = () => port.close();
  const all = suggested.concat(data.logins || []);
  const chosen = all.find((i) => i.id === pick);
  const save = async () => {
    setBusy(true);
    setErr(null);
    const target = pick === "new" ? { newEntry: { name: siteTitle, username: userName, space } } : { id: pick };
    const r = await port.ask("pk-create", { target });
    setBusy(false);
    if (!r.ok) {
      setErr(r.code === "exists" ? "APM already has a passkey for " + (userName || "this account") + " on " + data.rpId + ". Sign in with it instead." : errorText(r));
      return;
    }
    setDone(r.entryName || siteTitle);
    setTimeout(() => { port.tell("toast", { title: "Passkey saved to " + (r.entryName || siteTitle), description: "It works in every browser paired with APM." }); port.close(); }, 900);
  };
  if (!data.unlocked) {
    return (
      <SheetFrame title="Save a passkey" onCancel={abort}>
        <div className="title-2">Save a passkey for {data.rpId}</div>
        <p className="small muted">{siteTitle} wants to create a passkey{userName ? " for " + userName : ""}.</p>
        <LockedSheet data={data} port={port} what="save it to your vault" cancel={cancel} />
      </SheetFrame>
    );
  }
  const filtered = q.trim() ? all.filter((i) => (i.title + " " + (i.username || "")).toLowerCase().includes(q.trim().toLowerCase())) : suggested.length ? suggested : all.slice(0, 6);
  return (
    <SheetFrame title="Save a passkey" onCancel={abort}>
      <div className="title-2">Save a passkey for {data.rpId}</div>
      <p className="small muted">{siteTitle} wants to create a passkey{userName ? " for " + userName : ""}. APM keeps it in your vault, so it works in every browser you pair.</p>
      <div className="sheet-label small">Save to</div>
      {!open ? (
        pick === "new" || !chosen ? (
          <div className="pick is-on static">
            <span className="apm-tile apm-tile-md"><A.Icon name="plus" size={16} /></span>
            <span className="row-text"><span className="row-title">New login for {data.rpId}</span><span className="row-sub">{userName || "Holds only this passkey"} · {spaceLabel(space)}</span></span>
            <A.Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Change</A.Button>
          </div>
        ) : (
          <PickRow it={chosen} on><A.Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Change</A.Button></PickRow>
        )
      ) : (
        <>
          {all.length > 6 && <A.SearchField size="sm" placeholder="Search logins" value={q} onChange={setQ} shortcut={null} autoFocus />}
          <div className="sheet-list">
            {filtered.map((i) => <PickRow key={i.id} it={i} on={pick === i.id} onClick={() => { setPick(i.id); setOpen(false); setErr(null); }} />)}
            <button type="button" className={cx("pick", pick === "new" && "is-on")} onClick={() => { setPick("new"); setOpen(false); setErr(null); }}>
              <span className="apm-tile apm-tile-md"><A.Icon name="plus" size={16} /></span>
              <span className="row-text"><span className="row-title">New login for {data.rpId}</span><span className="row-sub">Holds only this passkey</span></span>
              <span className="pick-mark">{pick === "new" && <A.Icon name="check" size={14} strokeWidth={2.25} />}</span>
            </button>
          </div>
        </>
      )}
      {pick === "new" && !open && (data.spaces || []).length > 0 && (
        <A.Select id="pk-space" size="sm" label="Space" value={space} onChange={setSpace} options={[""].concat(data.spaces.map((s) => s.name).filter(Boolean)).map((s) => ({ value: s, label: spaceLabel(s) }))} />
      )}
      {err && <p className="caption np-err"><A.Icon name="circle-alert" size={14} />{err}</p>}
      <div className="sheet-foot">
        <A.Button variant="ghost" size="sm" onClick={cancel} disabled={busy || !!done}>Use this browser instead</A.Button>
        <span className="np-spacer" />
        <A.Button variant="primary" icon={done ? "check" : "fingerprint"} loading={busy} disabled={!!done} onClick={save}>{done ? "Saved" : "Save passkey"}</A.Button>
      </div>
      <div className="sheet-mono mono-small">ES256 · P-256 · kept in APM, not in Chrome</div>
    </SheetFrame>
  );
}

function PasskeyGet({ data, port, reinit }) {
  useUnlockWatch(!data.unlocked, reinit);
  const keys = data.passkeys || [];
  const [pick, setPick] = React.useState(keys[0] ? keys[0].credentialId : null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  React.useEffect(() => { if (!pick && keys[0]) setPick(keys[0].credentialId); }, [keys.length]);
  const cancel = async () => { await port.ask("pk-fallback"); port.close(); };
  const abort = () => port.close();
  const sign = async (id) => {
    const cid = id || pick;
    if (!cid) return;
    setBusy(true);
    setErr(null);
    const r = await port.ask("pk-pick", { credentialId: cid });
    setBusy(false);
    if (!r.ok) { setErr(errorText(r)); return; }
    port.close();
  };
  if (!data.unlocked) {
    return (
      <SheetFrame title="Sign in with a passkey" onCancel={abort}>
        <div className="title-2">Sign in to {data.rpId}</div>
        <p className="small muted">The site is asking for a passkey you saved in APM.</p>
        <LockedSheet data={data} port={port} what="sign in with your passkey" cancel={cancel} />
      </SheetFrame>
    );
  }
  if (!keys.length) {
    return (
      <SheetFrame title="Sign in with a passkey" onCancel={abort}>
        <div className="title-2">No passkey for {data.rpId}</div>
        <p className="small muted">Your vault has no passkey this site accepts. Use another device, or sign in with a password.</p>
        <div className="sheet-foot"><span className="np-spacer" /><A.Button variant="primary" onClick={cancel}>Use another device</A.Button></div>
      </SheetFrame>
    );
  }
  return (
    <SheetFrame title="Sign in with a passkey" onCancel={abort}>
      <div className="title-2">Sign in to {data.rpId}</div>
      <p className="small muted">Choose a passkey from your vault.</p>
      <div className="sheet-list">
        {keys.map((p) => (
          <button key={p.credentialId} type="button" className={cx("pick", pick === p.credentialId && "is-on")} onClick={() => setPick(p.credentialId)} onDoubleClick={() => sign(p.credentialId)}>
            <A.ItemIcon icon="fingerprint" />
            <span className="row-text"><span className="row-title">{p.userName || p.entryName}</span><span className="row-sub">{p.entryName}{p.space ? " · " + spaceLabel(p.space) : ""}{p.lastUsedAt ? " · used " + agoLong(p.lastUsedAt) : ""}</span></span>
            <span className="pick-mark">{pick === p.credentialId && <A.Icon name="check" size={14} strokeWidth={2.25} />}</span>
          </button>
        ))}
      </div>
      {err && <p className="caption np-err"><A.Icon name="circle-alert" size={14} />{err}</p>}
      <div className="sheet-foot">
        <A.Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>Use another device</A.Button>
        <span className="np-spacer" />
        <A.Button variant="primary" loading={busy} onClick={() => sign()} autoFocus>Sign in</A.Button>
      </div>
      <div className="sheet-mono mono-small">Signed by APM with ECDSA P-256 · the key never leaves your vault</div>
    </SheetFrame>
  );
}

function Toast({ data, port }) {
  React.useEffect(() => {
    const id = setTimeout(() => port.close(), 3600);
    return () => clearTimeout(id);
  }, []);
  const tone = data.tone === "neutral" ? "neutral" : data.tone === "danger" ? "danger" : "success";
  return <A.Toast title={data.title} description={data.description || null} tone={tone} className="pr-toast" />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
