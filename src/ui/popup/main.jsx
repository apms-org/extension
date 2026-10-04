import { A, cx, n, Overline, ToastHost, useToast, copiedToast, errorText, spaceLabel } from "../common/kit.jsx";
import { send } from "../common/rpc.js";
import { Pair, Offline, NoVault, Locked } from "./gate.jsx";
import { SiteTab, VaultTab, CodesTab, GenTab } from "./tabs.jsx";
import { Detail, NewLogin, Passkeys } from "./views.jsx";
import { Ctx, usePopup } from "./ctx.js";
import { iconHost } from "../../shared/iconkey.js";

function App() {
  const [init, setInit] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const load = React.useCallback(async () => {
    const r = await send("popup:init");
    if (r && r.status) { setInit(r); setErr(null); } else setErr(errorText(r, "The extension could not start."));
    return r;
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const later = init && init.status && init.status.unlocked ? init.items.filter((i) => !i.icon && iconHost(i)).length : 0;
  React.useEffect(() => {
    if (!later) return;
    const id = setTimeout(async () => {
      const hosts = Array.from(new Set(init.items.filter((i) => !i.icon).map(iconHost).filter(Boolean)));
      const r = await send("icons", { hosts });
      if (!r.ok || !r.icons || !Object.keys(r.icons).length) return;
      setInit((cur) => cur && Object.assign({}, cur, { items: cur.items.map((i) => (!i.icon && r.icons[iconHost(i)] ? Object.assign({}, i, { icon: r.icons[iconHost(i)] }) : i)) }));
    }, 2500);
    return () => clearTimeout(id);
  }, [init && init.items, later]);
  if (err) return <div className="px"><div className="px-center"><A.EmptyState icon="triangle-alert" title="APM could not start" action={<A.Button variant="primary" icon="refresh-cw" onClick={load}>Try again</A.Button>}>{err}</A.EmptyState></div></div>;
  if (!init) return <div className="px" aria-busy="true"><div className="px-center"><A.Mark tile size={40} className="boot-mark" /></div></div>;
  return (
    <div className="px">
      <ToastHost className="px-toasts">
        <Ctx.Provider value={{ init, reload: load, setInit }}>
          <Gate />
        </Ctx.Provider>
      </ToastHost>
    </div>
  );
}

function Gate() {
  const { init, reload } = usePopup();
  const st = init.status;
  if (!st.paired) return <Pair rejected={st.rejected} reachable={st.reachable} via={st.via} onDone={reload} pairing={init.pairing} />;
  if (!st.reachable) return <Offline onRetry={reload} port={init.port} linked={st.linked} hostError={st.hostError} />;
  if (st.exists === false) return <NoVault onRetry={reload} />;
  if (!st.unlocked) return <Locked status={st} onUnlock={reload} />;
  return <Main />;
}

function Main() {
  const { init, reload } = usePopup();
  const push = useToast();
  const [tab, setTab] = React.useState(() => (init.tab && init.tab.web ? "site" : "vault"));
  const [stack, setStack] = React.useState([]);
  const [space, setSpaceState] = React.useState(init.space || "all");
  const top = stack[stack.length - 1];
  const go = (v) => setStack((s) => s.concat([v]));
  const back = () => setStack((s) => s.slice(0, -1));
  const setSpace = (s) => { setSpaceState(s); send("space:set", { space: s }); };
  const items = init.items.filter((i) => space === "all" || (i.space || "") === space);
  const byId = Object.fromEntries(init.items.map((i) => [i.id, i]));
  const matches = init.matches.map((id) => byId[id]).filter(Boolean);
  const others = init.others.map((id) => byId[id]).filter(Boolean);

  const lock = async () => {
    const r = await send("vault:lock");
    if (!r.ok) push({ title: errorText(r), tone: "danger" });
    await reload();
  };

  if (top && top.v === "detail") return <Detail id={top.id} onBack={back} onChanged={reload} onGone={() => { back(); reload(); }} />;
  if (top && top.v === "new") return <NewLogin onBack={back} onSaved={async (it) => { setStack([]); await reload(); push({ title: "Saved " + it.title + " to " + spaceLabel(it.space || "") }); }} />;
  if (top && top.v === "passkeys") return <Passkeys onBack={back} onOpen={(id) => go({ v: "detail", id })} />;

  return (
    <>
      <Head space={space} setSpace={setSpace} onNew={() => go({ v: "new" })} onLock={lock} onPasskeys={() => go({ v: "passkeys" })} />
      <div className="px-tabs">
        <A.Tabs label="Sections" value={tab} onChange={setTab} items={[
          { value: "site", label: "This site", count: init.tab && init.tab.web ? matches.length : undefined },
          { value: "vault", label: "Vault" },
          { value: "codes", label: "Codes" },
          { value: "gen", label: "Generator" }
        ]} />
      </div>
      <div className="px-body" key={tab}>
        {tab === "site" && <SiteTab matches={matches} others={others} onOpen={(id) => go({ v: "detail", id })} onNew={() => go({ v: "new" })} />}
        {tab === "vault" && <VaultTab items={items} onOpen={(id) => go({ v: "detail", id })} onNew={() => go({ v: "new" })} />}
        {tab === "codes" && <CodesTab space={space} />}
        {tab === "gen" && <GenTab />}
      </div>
      <Foot />
    </>
  );
}

function Head({ space, setSpace, onNew, onLock, onPasskeys }) {
  const { init, reload } = usePopup();
  const push = useToast();
  const count = (id) => String(init.items.filter((i) => id === "all" || (i.space || "") === id).length);
  const spaces = [""].concat((init.spaces || []).map((s) => s.name));
  const host = init.tab && init.tab.web ? init.tab.host : "";
  const paused = !!init.rule;
  const pause = async () => {
    const r = await send(paused ? "site:resume" : "site:pause", { rule: "both" });
    if (r.ok) { push({ title: paused ? "APM is back on " + host : "Paused APM on " + host, tone: "neutral", icon: paused ? "power" : "shield-off" }); reload(); }
  };
  return (
    <header className="px-head">
      <A.Menu label="Spaces" width={220} trigger={<button type="button" className="space-btn"><A.Mark tile size={22} /><span className="space-name">{spaceLabel(space)}</span><A.Icon name="chevrons-up-down" size={14} /></button>} items={[
        { section: "Spaces" },
        { label: "All spaces", icon: "layers", hint: count("all"), checked: space === "all", onSelect: () => setSpace("all") },
        ...spaces.map((s) => ({ label: spaceLabel(s), icon: "folder", hint: count(s), checked: space === s, onSelect: () => setSpace(s) }))
      ]} />
      <div className="px-head-actions">
        <A.IconButton icon="plus" label="New login" size="sm" onClick={onNew} />
        <A.IconButton icon="lock" label="Lock vault" size="sm" onClick={onLock} />
        <A.Menu align="end" width={248} label="More" trigger={<A.IconButton icon="ellipsis" label="More" size="sm" />} items={[
          { label: "Passkeys", icon: "fingerprint", onSelect: onPasskeys },
          { label: "Extension settings", icon: "settings", onSelect: () => { send("open:options"); window.close(); } },
          host && { separator: true },
          host && { label: (paused ? "Resume APM on " : "Pause APM on ") + host, icon: paused ? "power" : "shield-off", onSelect: pause },
          { separator: true },
          { label: "Lock vault", icon: "lock", kbd: ["⌥", "⇧", "L"], onSelect: onLock }
        ]} />
      </div>
    </header>
  );
}

function Foot() {
  const { init } = usePopup();
  const st = init.status;
  return (
    <footer className="px-foot">
      <span className="live-dot" aria-hidden="true" />
      <span className="px-foot-main">Connected to APM{st.version ? " " + st.version : ""}</span>
      <span className="px-foot-end">{st.name || n(st.items || 0, "item")}</span>
    </footer>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
