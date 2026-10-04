import { A, cx, errorText } from "../common/kit.jsx";
import { send } from "../common/rpc.js";
import { LINK_CMD } from "../../shared/settings.js";

export function LinkCommand({ children }) {
  return (
    <div className="pair-link">
      {children && <span>{children}</span>}
      <A.Command block cmd={LINK_CMD} label="Copy the command" />
    </div>
  );
}

export function PairFlow({ rejected, reachable, via, onDone, compact, initial }) {
  const pend = initial && initial.status === "pending" && initial.expires > Date.now() ? initial : null;
  const [phase, setPhase] = React.useState(pend ? "waiting" : "idle");
  const [req, setReq] = React.useState(pend);
  const [err, setErr] = React.useState(initial && initial.status === "denied" ? (initial.via === "link" ? "The request was denied in the terminal." : "The request was denied in APM.") : rejected ? "APM no longer accepts this browser's pairing. Connect again." : null);
  const [manual, setManual] = React.useState(false);
  const [tok, setTok] = React.useState("");
  const [left, setLeft] = React.useState(pend ? Math.max(0, Math.round((pend.expires - Date.now()) / 1000)) : 0);
  const poll = React.useRef(null);
  React.useEffect(() => () => clearInterval(poll.current), []);

  const watch = (r) => {
    setReq(r);
    setPhase("waiting");
    clearInterval(poll.current);
    const tick = async () => {
      setLeft(Math.max(0, Math.round((r.expires - Date.now()) / 1000)));
      const p = await send("pair:poll");
      if (!p.ok) return;
      if (p.status === "approved") { clearInterval(poll.current); setPhase("done"); onDone(); }
      else if (p.status === "denied") { clearInterval(poll.current); setPhase("idle"); setErr(r.via === "link" ? "The request was denied in the terminal." : "The request was denied in APM."); }
      else if (p.status === "expired" || p.status === "error" || p.status === "none") { clearInterval(poll.current); setPhase("idle"); setErr("The request expired before it was confirmed. Try again."); }
    };
    poll.current = setInterval(tick, 1000);
    setLeft(Math.max(0, Math.round((r.expires - Date.now()) / 1000)));
  };

  React.useEffect(() => { if (pend) watch(pend); }, []);

  const start = async () => {
    setErr(null);
    setPhase("starting");
    const r = await send("pair:start");
    if (!r.ok) {
      setPhase("idle");
      setErr(r.code === "offline" ? "APM isn't connected. Open the APM app, or run pm extension link once, then try again." : r.code === "cooldown" ? "Too many requests. Wait a minute and try again." : errorText(r));
      return;
    }
    if (r.status === "approved") { setPhase("done"); onDone(); return; }
    watch(r);
  };

  const useToken = async (e) => {
    e.preventDefault();
    setPhase("starting");
    const r = await send("pair:token", { token: tok });
    setPhase("idle");
    if (!r.ok) { setErr(errorText(r)); return; }
    onDone();
  };

  if (manual) {
    return (
      <form className="pair-body" onSubmit={useToken}>
        <A.Input id="pair-token" label="Pairing token" placeholder="64 letters and digits" value={tok} onChange={(e) => { setTok(e.target.value); setErr(null); }} invalid={!!err} hint={err || "In APM, open Settings, then Browser extension, and copy the token. In a terminal, pm bridge token --show prints it."} hintTone={err ? "danger" : undefined} className="mono-input" autoComplete="off" spellCheck={false} autoFocus />
        <A.Button variant="primary" block type="submit" loading={phase === "starting"} disabled={!tok.trim()}>Connect</A.Button>
        <button type="button" className="linkbtn" onClick={() => { setManual(false); setErr(null); }}>Connect with a code instead</button>
      </form>
    );
  }

  if (phase === "waiting" && req) {
    const link = req.via === "link";
    return (
      <div className="pair-body">
        <div className="pair-code" aria-label={"Code " + req.code}>{String(req.code).split("").map((c, i) => <span key={i} className={c === "-" ? "sep" : undefined}>{c}</span>)}</div>
        {link ? (
          <>
            <p className="small center">Confirm this browser in your terminal. Check the code matches, then answer <b>y</b>.</p>
            <LinkCommand>Not running yet? Start it, and it asks for this code:</LinkCommand>
          </>
        ) : (
          <p className="small center">APM is asking you to confirm this browser. Check the code matches, then choose Connect in the app.</p>
        )}
        <div className="pair-wait"><A.Spinner size={14} /><span>{link ? "Waiting for pm" : "Waiting for APM"}</span><span className="mono-small muted">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span></div>
        <A.Button variant="ghost" block onClick={() => { clearInterval(poll.current); send("pair:cancel"); setPhase("idle"); }}>Cancel</A.Button>
      </div>
    );
  }

  return (
    <div className="pair-body">
      {reachable ? (
        <div className="pair-found"><A.Icon name="circle-check" size={16} /><span>{via === "native" ? "pm is linked on this computer" : "APM is running on this computer"}</span></div>
      ) : (
        <div className="pair-found is-off"><A.Icon name="circle-alert" size={16} /><span>APM isn't connected. Open the app, or link this browser once.</span></div>
      )}
      {!compact && (
        <ol className="steps">
          <li><span className="step-n">1</span><span>Open the APM app, or run this once in a terminal so the browser can start pm without the app:</span></li>
          <li className="steps-cmd"><A.Command block cmd={LINK_CMD} label="Copy the command" /></li>
          <li><span className="step-n">2</span><span>The extension connects by itself. There is nothing to paste.</span></li>
          <li><span className="step-n">3</span><span>Check the code matches, then choose <b>Connect</b> in the app, or answer <b>y</b> in the terminal.</span></li>
        </ol>
      )}
      {compact && !reachable && <LinkCommand>Without the app, run this once in a terminal:</LinkCommand>}
      {err && <A.Callout tone="danger" icon="circle-alert">{err}</A.Callout>}
      <A.Button variant="primary" block onClick={start} loading={phase === "starting"}>Connect</A.Button>
      <button type="button" className="linkbtn" onClick={() => { setManual(true); setErr(null); }}>Use a pairing token instead</button>
    </div>
  );
}

export function Pair({ rejected, reachable, via, onDone, pairing }) {
  return (
    <div className="px-pair">
      <A.Mark tile size={44} />
      <div className="pair-head">
        <h1 className="title-1">Connect to APM</h1>
        <p className="small muted">{!reachable ? "The extension fills from your vault through the APM app, or through pm when the app is closed. It cannot open vault.dat on its own." : via === "native" ? "Connecting to pm on this computer. You confirm it once in the terminal." : "Connecting to the APM app on this computer."}</p>
      </div>
      <PairFlow rejected={rejected} reachable={reachable} via={via} onDone={onDone} initial={pairing} />
    </div>
  );
}

export function Offline({ onRetry, port, linked, hostError }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="px-center">
      <A.EmptyState icon="plug" title="APM isn't connected" action={<A.Button variant="primary" icon="refresh-cw" loading={busy} onClick={async () => { setBusy(true); await onRetry(); setBusy(false); }}>Try again</A.Button>}>
        {linked ? (
          <LinkCommand>{"pm is linked but did not answer" + (hostError ? ": " + hostError.replace(/\.$/, "") + "." : ".") + " Open the APM app, or run the link again to repair it."}</LinkCommand>
        ) : (
          <LinkCommand>{"Open the APM app on 127.0.0.1:" + (port || 41417) + ", or run this once in a terminal so the browser can start pm when the app is closed."}</LinkCommand>
        )}
      </A.EmptyState>
    </div>
  );
}

export function NoVault({ onRetry }) {
  return (
    <div className="px-center">
      <A.EmptyState icon="file-lock-2" title="No vault yet" action={<A.Button variant="primary" icon="refresh-cw" onClick={onRetry}>Check again</A.Button>}>
        Create a vault in the APM app first, then come back here.
      </A.EmptyState>
    </div>
  );
}

function unlockError(r) {
  const d = r.data || {};
  if (r.code === "wrong_password") return "Incorrect password." + (d.left != null ? " " + d.left + (d.left === 1 ? " attempt" : " attempts") + " left before recovery is required." : "");
  if (r.code === "cooldown") return "Too many attempts. Try again in " + (d.wait || 30) + " seconds.";
  if (r.code === "breach_lock") return "This vault is locked after repeated failed attempts. Use recovery in the APM app.";
  return errorText(r);
}

export function Locked({ status, onUnlock }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(status.cooldown ? "Too many attempts. Try again in " + status.cooldown + " seconds." : null);
  const [shake, setShake] = React.useState(0);
  const [touch, setTouch] = React.useState(false);
  const touchOk = status.touchId && status.touchId.available && status.touchId.configured;
  const submit = async (v) => {
    if (!v) return;
    setBusy(true);
    setErr(null);
    const r = await send("vault:unlock", { password: v });
    setBusy(false);
    if (!r.ok) { setErr(unlockError(r)); setShake((s) => s + 1); return; }
    onUnlock();
  };
  const touchId = async () => {
    setTouch(true);
    setErr(null);
    const r = await send("vault:touchid");
    setTouch(false);
    if (!r.ok) { setErr(r.code === "touchid_failed" ? "Touch ID was cancelled or did not match." : unlockError(r)); return; }
    onUnlock();
  };
  return (
    <div className="px-lock">
      <div className="lock-top">
        <A.Mark tile size={56} />
        <h1 className="display lock-h">Unlock your vault</h1>
        <p className="small muted">{status.name ? status.name + " is locked" : "Your vault is locked"}</p>
      </div>
      <div className="lock-form">
        <A.PasswordInput autoFocus busy={busy} error={err} shakeKey={shake} onSubmit={submit} hint={busy ? "Deriving key · Argon2id" : undefined} />
        {busy && <A.Progress indeterminate label="Deriving key" />}
        {touchOk && <>
          <div className="or"><span>or</span></div>
          <A.Button variant="secondary" block icon="fingerprint" loading={touch} onClick={touchId}>{touch ? "Confirm Touch ID" : "Unlock with Touch ID"}</A.Button>
        </>}
      </div>
      <p className="lock-note caption">{status.via === "native" ? "Your password goes to pm on this computer through the browser's native messaging. The extension never keeps it." : "Your password goes to the APM app over the paired loopback bridge. The extension never keeps it."}</p>
      <div className="lock-foot mono-small">XChaCha20-Poly1305 · Argon2id</div>
    </div>
  );
}
