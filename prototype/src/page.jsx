import { A, cx, Colorized, generate, strength, GEN_DEFAULTS } from "./util.jsx";
import { SITE, ITEMS, SPACES } from "./seed.js";

const spaceName = (id) => (SPACES.find((s) => s.id === id) || {}).name;
const matches = ITEMS.filter((i) => i.url === SITE.host && i.type === "login");

function HarborLogo() {
  return (
    <span className="hb-logo" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.5" /><path d="M12 7.5V21" /><path d="M5 13a7 7 0 0 0 14 0" /><path d="M8 11h8" /></svg>
      <b>Harbor</b>
    </span>
  );
}

function FieldMark({ onClick, locked }) {
  return (
    <button type="button" className={cx("fmark", locked && "is-locked")} aria-label="Open APM for this field" onClick={onClick}>
      <A.Mark size={14} />
    </button>
  );
}

export function Page({ scene, filled, setFilled, pageToast, setPageToast }) {
  const ov0 = scene.overlay || null;
  const [ov, setOv] = React.useState(ov0);
  const [state, setState] = React.useState(scene.pageState || "form");
  React.useEffect(() => { setOv(ov0); }, [ov0]);
  const variant = scene.page || "login";
  const fill = (it) => { setFilled(it); setOv(null); setPageToast({ title: "Filled " + it.user, description: it.totp ? "One-time code copied · Clears in 30s" : null }); };
  const val = (k) => (filled ? filled[k] : "");
  return (
    <div className="site">
      <div className="hb-nav"><HarborLogo /><span className="hb-links"><span>Explore</span><span>Pricing</span><span>Docs</span></span></div>
      <div className="hb-main">
        {state === "signed-in" ? (
          <div className="hb-card hb-done">
            <HarborLogo />
            <h2>Welcome back, Aarav</h2>
            <p>Signed in with a passkey from APM. 3 repositories were updated since your last visit.</p>
          </div>
        ) : variant === "signup" ? (
          <form className="hb-card" onSubmit={(e) => { e.preventDefault(); setOv("save"); }}>
            <h2>Create your Harbor account</h2>
            <label className="hb-label" htmlFor="hb-su-email">Email</label>
            <div className="hb-field"><input id="hb-su-email" className="hb-input" defaultValue="aarav@maloo.dev" /><FieldMark /></div>
            <label className="hb-label" htmlFor="hb-su-pw">Password</label>
            <div className="hb-field">
              <input id="hb-su-pw" className={cx("hb-input", filled && "is-filled")} type="password" value={filled ? filled.password : ""} readOnly placeholder="At least 12 characters" onFocus={() => setOv("newpw")} />
              <FieldMark onClick={() => setOv(ov === "newpw" ? null : "newpw")} />
              {ov === "newpw" && <NewPasswordMenu onFill={(v) => { setFilled({ password: v, user: "aarav@maloo.dev" }); setOv(null); setPageToast({ title: "Filled a new password", description: "APM offers to save it when you submit" }); }} onClose={() => setOv(null)} />}
            </div>
            <button type="submit" className="hb-btn">Create account</button>
          </form>
        ) : variant === "otp" ? (
          <div className="hb-card">
            <h2>Two-factor authentication</h2>
            <p className="hb-p">Enter the 6-digit code from your authenticator app for aarav@maloo.dev.</p>
            <label className="hb-label" htmlFor="hb-otp">Authentication code</label>
            <div className="hb-field">
              <input id="hb-otp" className={cx("hb-input hb-otp", filled && "is-filled")} value={filled && filled.code ? filled.code : ""} readOnly placeholder="123 456" onFocus={() => setOv("otp")} />
              <FieldMark onClick={() => setOv(ov === "otp" ? null : "otp")} />
              {ov === "otp" && <OtpMenu onFill={(code) => { setFilled({ code }); setOv(null); setPageToast({ title: "Filled one-time code", description: "Harbor · aarav@maloo.dev" }); }} />}
            </div>
            <button type="button" className="hb-btn">Verify</button>
          </div>
        ) : (
          <form className="hb-card" onSubmit={(e) => { e.preventDefault(); setOv(filled && filled.id === "harbor-me" ? "update" : "save"); }}>
            <h2>Sign in to Harbor</h2>
            <label className="hb-label" htmlFor="hb-email">Email</label>
            <div className="hb-field">
              <input id="hb-email" className={cx("hb-input", filled && "is-filled")} value={val("user")} readOnly placeholder="you@example.com" onFocus={() => setOv(scene.locked ? "locked" : "fill")} />
              <FieldMark locked={scene.locked} onClick={() => setOv(ov ? null : scene.locked ? "locked" : "fill")} />
              {ov === "fill" && <FillMenu onFill={fill} onPasskey={() => setOv("pk-get")} />}
              {ov === "locked" && <LockedMenu />}
            </div>
            <label className="hb-label" htmlFor="hb-pw">Password</label>
            <div className="hb-field"><input id="hb-pw" className={cx("hb-input", filled && "is-filled")} type="password" value={val("password")} readOnly placeholder="Password" /><FieldMark locked={scene.locked} /></div>
            <button type="submit" className="hb-btn">Sign in</button>
            <div className="hb-or"><span>or</span></div>
            <button type="button" className="hb-btn hb-btn-2" onClick={() => setOv("pk-get")}>Sign in with a passkey</button>
            <p className="hb-foot">New to Harbor? <u>Create an account</u></p>
          </form>
        )}
      </div>
      {ov === "save" && <SavePrompt onClose={() => setOv(null)} onSaved={(t) => { setOv(null); setPageToast({ title: t }); }} />}
      {ov === "update" && <UpdatePrompt onClose={() => setOv(null)} onSaved={(t) => { setOv(null); setPageToast({ title: t }); }} />}
      {ov === "pk-create" && <PasskeyCreate onClose={() => setOv(null)} onSaved={() => { setOv(null); setPageToast({ title: "Saved passkey to Harbor", description: "aarav@maloo.dev · Personal" }); }} />}
      {ov === "pk-get" && <PasskeyGet onClose={() => setOv(null)} onDone={() => { setOv(null); setState("signed-in"); }} />}
      {pageToast && <div className="page-toast"><A.Toast key={pageToast.title + (pageToast.description || "")} title={pageToast.title} description={pageToast.description} onDone={() => setPageToast(null)} /></div>}
    </div>
  );
}

function MenuHead({ right }) {
  return (
    <div className="im-head">
      <A.Mark size={14} />
      <span className="im-brand">APM</span>
      <span className="im-host mono-small">{SITE.host}</span>
      {right}
    </div>
  );
}

function FillMenu({ onFill, onPasskey }) {
  const [act, setAct] = React.useState(0);
  React.useEffect(() => {
    const k = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(a + 1, matches.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(a - 1, 0)); }
      if (e.key === "Enter") { e.preventDefault(); onFill(matches[act]); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [act]);
  return (
    <div className="im" role="listbox" aria-label="APM logins for harbor.dev">
      <MenuHead right={<A.Kbd keys={["↑", "↓"]} />} />
      {matches.map((it, i) => (
        <button key={it.id} type="button" role="option" aria-selected={i === act} className={cx("im-row", i === act && "is-active")} onMouseEnter={() => setAct(i)} onClick={() => onFill(it)}>
          <A.ItemIcon name={it.title} size="sm" />
          <span className="row-text"><span className="row-title">{it.user}</span><span className="row-sub">{it.title} · {spaceName(it.space)}{it.totp ? " · fills the code next" : ""}</span></span>
          {i === act && <A.Kbd keys={["↵"]} />}
        </button>
      ))}
      <div className="im-sep" />
      <button type="button" className="im-row im-action" onClick={onPasskey}><A.Icon name="fingerprint" size={16} /><span>Sign in with a passkey</span></button>
      <button type="button" className="im-row im-action"><A.Icon name="search" size={16} /><span>Search the vault</span><A.Kbd keys={["⌥", "⇧", "A"]} /></button>
    </div>
  );
}

function LockedMenu() {
  return (
    <div className="im">
      <MenuHead />
      <div className="im-locked">
        <span className="im-lock-ic"><A.Icon name="lock" size={16} /></span>
        <span className="row-text"><span className="row-title">APM is locked</span><span className="im-lock-body">Unlock from the toolbar to fill. APM never asks for your master password inside a web page.</span></span>
      </div>
      <div className="im-sep" />
      <button type="button" className="im-row im-action"><A.Icon name="lock-open" size={16} /><span>Unlock in the toolbar</span><A.Kbd keys={["⌥", "⇧", "A"]} /></button>
    </div>
  );
}

function OtpMenu({ onFill }) {
  const code = React.useRef("");
  const it = matches[0];
  return (
    <div className="im">
      <MenuHead />
      <button type="button" className="im-row is-active im-otp" onClick={() => onFill(code.current)}>
        <A.ItemIcon name={it.title} size="sm" />
        <span className="row-text"><span className="row-title">{it.user}</span><span className="row-sub">{it.title} · {spaceName(it.space)}</span></span>
        <A.TotpCode secret={it.totp} onCode={(c) => { code.current = c; }} />
      </button>
      <div className="im-note caption">Matched because you filled this login on {SITE.host} 20s ago.</div>
    </div>
  );
}

function NewPasswordMenu({ onFill, onClose }) {
  const [v, setV] = React.useState(() => generate(GEN_DEFAULTS));
  const [spin, setSpin] = React.useState(0);
  const s = strength(GEN_DEFAULTS);
  return (
    <div className="im im-gen">
      <MenuHead right={<A.IconButton icon="x" label="Close" size="xs" onClick={onClose} />} />
      <div className="im-gen-body">
        <div className="im-gen-title small-medium">Use a strong password</div>
        <div className="im-gen-out">
          <span className="mono im-gen-v" key={spin}><Colorized value={v} /></span>
          <A.IconButton icon="refresh-cw" label="Generate another" size="xs" onClick={() => { setV(generate(GEN_DEFAULTS)); setSpin(spin + 1); }} />
        </div>
        <A.StrengthMeter score={s.score} bits={s.bits} detail={s.detail} />
        <div className="im-gen-actions">
          <A.Button size="sm" variant="ghost" icon="sliders-horizontal">Options</A.Button>
          <A.Button size="sm" variant="primary" onClick={() => onFill(v)}>Fill password</A.Button>
        </div>
      </div>
      <div className="im-note caption">APM offers to save it to your vault when you submit the form.</div>
    </div>
  );
}

function PromptShell({ title, sub, onClose, children, foot }) {
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

function SavePrompt({ onClose, onSaved }) {
  const [name, setName] = React.useState("Harbor");
  const [user, setUser] = React.useState("aarav@maloo.dev");
  const [space, setSpace] = React.useState("personal");
  const [shown, setShown] = React.useState(false);
  const pw = "Lq7!vT2#pZ9xKm4wRe";
  return (
    <PromptShell title="Save login for harbor.dev?" sub="You just signed in. APM can fill it next time." onClose={onClose} foot={<>
      <A.Menu side="top" width={220} label="More" trigger={<A.Button size="sm" variant="ghost" iconRight="chevron-down">Not now</A.Button>} items={[
        { label: "Not now", icon: "x", onSelect: onClose },
        { label: "Never for harbor.dev", icon: "shield-off", onSelect: onClose }
      ]} />
      <span className="np-spacer" />
      <A.Button size="sm" variant="primary" onClick={() => onSaved("Saved " + name + " to " + spaceName(space))}>Save</A.Button>
    </>}>
      <div className="np-grid">
        <A.Input id="sp-name" size="sm" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <A.Select id="sp-space" size="sm" label="Space" value={space} onChange={setSpace} options={SPACES.map((s) => ({ value: s.id, label: s.name }))} />
      </div>
      <A.Input id="sp-user" size="sm" label="Username" value={user} onChange={(e) => setUser(e.target.value)} />
      <div className="np-pw">
        <span className="np-pw-label small">Password</span>
        <span className="np-pw-v mono">{shown ? <Colorized value={pw} /> : "••••••••••••••••••"}</span>
        <A.IconButton icon={shown ? "eye-off" : "eye"} label={shown ? "Hide" : "Reveal"} size="xs" onClick={() => setShown(!shown)} />
      </div>
    </PromptShell>
  );
}

function UpdatePrompt({ onClose, onSaved }) {
  return (
    <PromptShell title="Update the password for aarav@maloo.dev?" sub="Harbor · Personal" onClose={onClose} foot={<>
      <A.Button size="sm" variant="ghost" onClick={() => onSaved("Saved a new Harbor login to Personal")}>Save as new login</A.Button>
      <span className="np-spacer" />
      <A.Button size="sm" variant="primary" onClick={() => onSaved("Updated Harbor · Old password kept in history")}>Update</A.Button>
    </>}>
      <div className="np-diff">
        <div className="np-diff-row"><span className="small muted">Saved</span><span className="mono np-old">••••••••••••••••</span><A.Badge tone="warning" size="sm" icon="triangle-alert">Reused on npm</A.Badge></div>
        <div className="np-diff-row"><span className="small muted">New</span><span className="mono">••••••••••••••••••</span><A.Badge tone="success" size="sm" icon="shield-check">Strong</A.Badge></div>
      </div>
      <p className="caption muted">The saved password is 214 days old. APM keeps it in the item's history for 90 days.</p>
    </PromptShell>
  );
}

function PasskeyCreate({ onClose, onSaved }) {
  const [open, setOpen] = React.useState(false);
  const [pick, setPick] = React.useState(matches[0].id);
  const chosen = matches.find((m) => m.id === pick);
  return (
    <div className="sheet-wrap">
      <div className="sheet" role="dialog" aria-label="Save a passkey">
        <div className="sheet-head">
          <A.Mark tile size={32} />
          <A.IconButton icon="x" label="Cancel" size="sm" onClick={onClose} />
        </div>
        <div className="title-2">Save a passkey for harbor.dev</div>
        <p className="small muted">Harbor wants to create a passkey for aarav@maloo.dev. APM keeps it in your vault, so it works in every browser you pair.</p>
        <div className="sheet-label small">Save to</div>
        {!open ? (
          <div className="pick is-on static">
            <A.ItemIcon name={chosen.title} />
            <span className="row-text"><span className="row-title">{chosen.title}</span><span className="row-sub">{chosen.user} · {spaceName(chosen.space)}</span></span>
            <A.Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Change</A.Button>
          </div>
        ) : (
          <div className="sheet-list">
            {matches.map((m) => (
              <button key={m.id} type="button" className={cx("pick", pick === m.id && "is-on")} onClick={() => { setPick(m.id); setOpen(false); }}>
                <A.ItemIcon name={m.title} />
                <span className="row-text"><span className="row-title">{m.title}</span><span className="row-sub">{m.user} · {spaceName(m.space)}</span></span>
                <span className="pick-mark">{pick === m.id && <A.Icon name="check" size={14} strokeWidth={2.25} />}</span>
              </button>
            ))}
            <button type="button" className="pick" onClick={() => setOpen(false)}>
              <span className="apm-tile apm-tile-md"><A.Icon name="plus" size={16} /></span>
              <span className="row-text"><span className="row-title">New login for harbor.dev</span><span className="row-sub">Holds only this passkey</span></span>
            </button>
          </div>
        )}
        <div className="sheet-foot">
          <A.Button variant="ghost" size="sm">Use this browser instead</A.Button>
          <span className="np-spacer" />
          <A.Button variant="primary" icon="fingerprint" onClick={onSaved}>Save passkey</A.Button>
        </div>
        <div className="sheet-mono mono-small">ES256 · P-256 · stored in vault.dat, never in Chrome</div>
      </div>
    </div>
  );
}

function PasskeyGet({ onClose, onDone }) {
  const keys = matches.flatMap((m) => (m.passkeys || []).map((p) => ({ m, p })));
  const [pick, setPick] = React.useState(keys[0] && keys[0].p.id);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="sheet-wrap">
      <div className="sheet" role="dialog" aria-label="Sign in with a passkey">
        <div className="sheet-head">
          <A.Mark tile size={32} />
          <A.IconButton icon="x" label="Cancel" size="sm" onClick={onClose} />
        </div>
        <div className="title-2">Sign in to harbor.dev</div>
        <p className="small muted">Choose a passkey from your vault.</p>
        <div className="sheet-list">
          {keys.map(({ m, p }) => (
            <button key={p.id} type="button" className={cx("pick", pick === p.id && "is-on")} onClick={() => setPick(p.id)}>
              <A.ItemIcon icon="fingerprint" />
              <span className="row-text"><span className="row-title">{p.user}</span><span className="row-sub">{m.title} · {spaceName(m.space)} · used {p.used} ago</span></span>
              <span className="pick-mark">{pick === p.id && <A.Icon name="check" size={14} strokeWidth={2.25} />}</span>
            </button>
          ))}
        </div>
        <div className="sheet-foot">
          <A.Button variant="ghost" size="sm">Use another device</A.Button>
          <span className="np-spacer" />
          <A.Button variant="primary" loading={busy} onClick={() => { setBusy(true); setTimeout(onDone, 900); }}>Sign in</A.Button>
        </div>
        <div className="sheet-mono mono-small">Signed in the page with ECDSA P-256 · sign count 14</div>
      </div>
    </div>
  );
}
