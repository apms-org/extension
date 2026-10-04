import { A, cx, Colorized, LiveCode, GenPanel, errorText, spaceLabel } from "../common/kit.jsx";
import { framePort, sessionFromHash, watchSize } from "../common/rpc.js";
import { generate, optionsStrength, GEN_DEFAULTS } from "../../shared/gen.js";

const session = sessionFromHash();

function useActive(count, onEnter) {
  const [act, setAct] = React.useState(-1);
  const ref = React.useRef({ count, onEnter, act });
  ref.current = { count, onEnter, act };
  const key = React.useCallback((k) => {
    const { count: c, onEnter: fn, act: a } = ref.current;
    if (!c) return;
    if (k === "ArrowDown") setAct(a < 0 ? 0 : (a + 1) % c);
    if (k === "ArrowUp") setAct(a <= 0 ? c - 1 : a - 1);
    if (k === "Enter" && a >= 0 && fn) fn(a);
  }, []);
  return [act, setAct, key];
}

function Head({ host, right }) {
  return (
    <div className="im-head">
      <A.Mark size={14} />
      <span className="im-brand">APM</span>
      <span className="im-host mono-small">{host}</span>
      {right}
    </div>
  );
}

function App() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const port = React.useRef(null);
  const keyFn = React.useRef(null);
  const root = React.useRef(null);

  React.useEffect(() => {
    port.current = framePort(session, {
      init: (m) => { if (!m.data || !m.data.ok) { port.current.close(); return; } setData(m.data); },
      key: (m) => { if (keyFn.current) keyFn.current(m.key); },
      refresh: async () => { const x = await port.current.ask("reinit"); if (x.ok) setData(x); },
      status: (m) => { if (m.status && !m.status.unlocked) setData((d) => d && d.kind !== "newpw" ? Object.assign({}, d, { kind: "locked" }) : d); }
    });
    const onKey = (e) => { if (e.key === "Escape") port.current.close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!data || !root.current) return;
    return watchSize(root.current, port.current, { width: 328 });
  }, [!!data]);

  React.useEffect(() => {
    if (!data || data.kind !== "locked") return;
    const id = setInterval(async () => {
      const r = await port.current.ask("status");
      if (r.ok && r.status && r.status.unlocked) {
        const x = await port.current.ask("reinit");
        if (x.ok) setData(x);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [data && data.kind]);

  const act = async (t, payload, label) => {
    setBusy(label || t);
    setErr(null);
    const r = await port.current.ask(t, payload);
    setBusy(null);
    if (!r.ok) setErr(errorText(r));
    return r;
  };

  if (!data) return <div className="im" ref={root} />;
  const close = () => port.current.close();
  const openPopup = async () => {
    const r = await port.current.ask("open-popup");
    if (!r.ok) setErr("Click the APM icon in the toolbar.");
    else close();
  };
  return (
    <div className="im" ref={root}>
      {data.kind === "login" && <Login data={data} act={act} busy={busy} keyFn={keyFn} openPopup={openPopup} />}
      {data.kind === "otp" && <Otp data={data} act={act} port={port.current} keyFn={keyFn} />}
      {data.kind === "newpw" && <NewPassword data={data} act={act} port={port.current} keyFn={keyFn} close={close} />}
      {data.kind === "locked" && <Locked data={data} openPopup={openPopup} keyFn={keyFn} />}
      {data.kind === "blocked" && <Blocked data={data} />}
      {data.kind === "connect" && <Connect openPopup={openPopup} />}
      {err && <div className="im-err caption"><A.Icon name="circle-alert" size={14} /><span>{err}</span></div>}
    </div>
  );
}

function Login({ data, act, busy, keyFn, openPopup }) {
  const rows = data.matches.map((m) => ({ kind: "login", m })).concat((data.passkeys || []).map((p) => ({ kind: "pk", p })));
  const run = (i) => {
    const r = rows[i];
    if (!r) return;
    if (r.kind === "login") act("fill", { id: r.m.id }, r.m.id);
    else act("pk-pick", { credentialId: r.p.credentialId }, r.p.credentialId);
  };
  const [active, setActive, key] = useActive(rows.length, run);
  keyFn.current = key;
  return (
    <>
      <Head host={data.host} right={rows.length > 1 ? <A.Kbd keys={["↑", "↓"]} /> : null} />
      {rows.length === 0 && <div className="im-empty caption">No logins saved for {data.host}. Sign in and APM offers to save it.</div>}
      {data.matches.map((m, i) => (
        <button key={m.id} type="button" className={cx("im-row", active === i && "is-active")} onMouseEnter={() => setActive(i)} onClick={() => run(i)} disabled={!!busy}>
          <A.ItemIcon name={m.title} src={m.icon || undefined} size="sm" />
          <span className="row-text"><span className="row-title">{m.username || m.title}</span><span className="row-sub">{m.title} · {spaceLabel(m.space || "")}{m.totp ? " · code ready" : ""}</span></span>
          {busy === m.id ? <A.Spinner size={14} /> : active === i ? <A.Kbd keys={["↵"]} /> : null}
        </button>
      ))}
      {(data.passkeys || []).length > 0 && <div className="im-label overline">Passkeys</div>}
      {(data.passkeys || []).map((p, j) => {
        const i = data.matches.length + j;
        return (
          <button key={p.credentialId} type="button" className={cx("im-row", active === i && "is-active")} onMouseEnter={() => setActive(i)} onClick={() => run(i)} disabled={!!busy}>
            <A.ItemIcon icon="fingerprint" size="sm" />
            <span className="row-text"><span className="row-title">{p.userName || p.entryName}</span><span className="row-sub">Passkey · {p.entryName}{p.label ? " · " + p.label : ""}</span></span>
            {busy === p.credentialId ? <A.Spinner size={14} /> : active === i ? <A.Kbd keys={["↵"]} /> : null}
          </button>
        );
      })}
      {data.more > 0 && <div className="im-note caption">{data.more} more in the toolbar popup.</div>}
      <div className="im-sep" />
      <button type="button" className="im-row im-action" onClick={openPopup}><A.Icon name="search" size={16} /><span>Search the vault</span><A.Kbd keys={["⌥", "⇧", "A"]} /></button>
    </>
  );
}

function Otp({ data, act, port, keyFn }) {
  const run = () => { if (data.item) act("fill-otp", { id: data.item.id }); };
  keyFn.current = (k) => { if (k === "Enter") run(); };
  if (!data.item) return <><Head host={data.host} /><div className="im-empty caption">No one-time code is saved for {data.host}. Add the setup key to an authenticator item in APM.</div></>;
  return (
    <>
      <Head host={data.host} />
      <button type="button" className="im-row im-otp is-active" onClick={run}>
        <A.ItemIcon name={data.item.title} src={data.item.icon || undefined} size="sm" />
        <span className="row-text"><span className="row-title">{data.item.username || data.item.title}</span><span className="row-sub">{data.item.title} · {spaceLabel(data.item.space || "")}</span></span>
        <LiveCode fetcher={() => port.ask("totp", { id: data.item.id })} deps={[data.item.id]} />
      </button>
      {data.recent && <div className="im-note caption">Matched because you filled this login on {data.host} a moment ago.</div>}
    </>
  );
}

function NewPassword({ data, act, port, keyFn, close }) {
  const [o, setO] = React.useState(() => Object.assign({}, GEN_DEFAULTS, data.gen || {}));
  const [v, setV] = React.useState(() => generate(Object.assign({}, GEN_DEFAULTS, data.gen || {})));
  const [spin, setSpin] = React.useState(0);
  const [more, setMore] = React.useState(false);
  const fill = (val) => act("fill-password", { value: val || v });
  keyFn.current = (k) => { if (k === "Enter") fill(); };
  const s = optionsStrength(v);
  const save = React.useRef(null);
  return (
    <>
      <Head host={data.host} right={<A.IconButton icon="x" label="Close" size="xs" onClick={close} />} />
      {!more ? (
        <div className="im-gen-body">
          <div className="im-gen-title small-medium">Use a strong password</div>
          <div className="im-gen-out">
            <span className="mono im-gen-v" key={spin}><Colorized value={v} /></span>
            <A.IconButton icon="refresh-cw" label="Generate another" size="xs" onClick={() => { setV(generate(o)); setSpin(spin + 1); }} />
          </div>
          <A.StrengthMeter key={"s" + spin} score={s.score} bits={s.bits} detail={s.detail} />
          <div className="im-gen-actions">
            <A.Button size="sm" variant="ghost" icon="sliders-horizontal" onClick={() => setMore(true)}>Options</A.Button>
            <A.Button size="sm" variant="primary" onClick={() => fill()}>Fill password</A.Button>
          </div>
        </div>
      ) : (
        <div className="im-gen-body">
          <GenPanel compact initial={o} onChange={(x) => { setO(x); clearTimeout(save.current); save.current = setTimeout(() => port.ask("gen:set", { gen: x }), 300); }} onUse={(val) => fill(val)} useLabel="Fill password" />
        </div>
      )}
      <div className="im-note caption">APM offers to save it to your vault when you submit the form.</div>
    </>
  );
}

function Locked({ data, openPopup, keyFn }) {
  keyFn.current = (k) => { if (k === "Enter") openPopup(); };
  return (
    <>
      <Head host={data.host} />
      <div className="im-locked">
        <span className="im-lock-ic"><A.Icon name="lock" size={16} /></span>
        <span className="row-text"><span className="row-title">APM is locked</span><span className="im-lock-body">Unlock from the toolbar to fill. APM never asks for your master password inside a web page.</span></span>
      </div>
      <div className="im-sep" />
      <button type="button" className="im-row im-action" onClick={openPopup}><A.Icon name="lock-open" size={16} /><span>Unlock in the toolbar</span><A.Kbd keys={["⌥", "⇧", "A"]} /></button>
    </>
  );
}

const REASONS = {
  http: (h) => h + " is not encrypted, so APM does not fill here. You can change this in the extension settings.",
  frame: () => "This form is inside a frame from another site. Filling there is off in the extension settings.",
  paused: (h) => "APM is paused on " + h + ". Resume it from the toolbar popup.",
  page: () => "APM can't fill on this page."
};

function Blocked({ data }) {
  return (
    <>
      <Head host={data.host} />
      <div className="im-locked">
        <span className="im-lock-ic"><A.Icon name="shield-off" size={16} /></span>
        <span className="row-text"><span className="row-title">Not filling here</span><span className="im-lock-body">{(REASONS[data.reason] || REASONS.page)(data.host)}</span></span>
      </div>
    </>
  );
}

function Connect({ openPopup }) {
  return (
    <>
      <Head host="" />
      <div className="im-locked">
        <span className="im-lock-ic"><A.Icon name="plug" size={16} /></span>
        <span className="row-text"><span className="row-title">APM isn't connected</span><span className="im-lock-body">Open the APM app, or run pm extension link once in a terminal. The extension connects by itself.</span></span>
      </div>
      <div className="im-sep" />
      <button type="button" className="im-row im-action" onClick={openPopup}><A.Icon name="external-link" size={16} /><span>Open APM in the toolbar</span></button>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
