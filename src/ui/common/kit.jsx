import { generate, optionsStrength, GEN_DEFAULTS } from "../../shared/gen.js";

export const A = window.APM;
export const cx = (...a) => a.filter(Boolean).join(" ");
export { n } from "../../shared/time.js";

export const spaceLabel = (s) => (s === "all" ? "All spaces" : s ? s : "Default");

export function Colorized({ value, className }) {
  return <span className={cx("clr", className)}>{Array.from(String(value)).map((c, i) => <span key={i} className={/[0-9]/.test(c) ? "d" : /[^A-Za-z0-9]/.test(c) ? "s" : undefined}>{c}</span>)}</span>;
}

export function Overline({ children, count, action }) {
  return <div className="ovl"><span>{children}</span>{count != null && <span className="ovl-count">{count}</span>}{action}</div>;
}

export const ToastCtx = React.createContext(() => {});
export const useToast = () => React.useContext(ToastCtx);

export function ToastHost({ children, className }) {
  const [t, setT] = React.useState(null);
  const push = React.useCallback((x) => setT(Object.assign({ key: Date.now() + Math.random() }, x)), []);
  React.useEffect(() => {
    if (!t || t.countdown) return;
    const id = setTimeout(() => setT(null), t.duration || 2400);
    return () => clearTimeout(id);
  }, [t]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className={cx("toast-slot", className)} aria-live="polite">
        {t && <A.Toast key={t.key} title={t.title} description={t.description} tone={t.tone} icon={t.icon} countdown={t.countdown} onDone={() => setT(null)} />}
      </div>
    </ToastCtx.Provider>
  );
}

export function copiedToast(push, what, r) {
  if (!r || !r.ok) { push({ title: (r && r.error) || "Could not copy " + what, tone: "danger" }); return; }
  push(r.clearIn ? { title: "Copied " + what, countdown: r.clearIn } : { title: "Copied " + what });
}

export function useLiveCode(fetcher, deps) {
  const [st, setSt] = React.useState({ data: null, offset: 0, err: null });
  const busy = React.useRef(false);
  const load = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const r = await fetcher();
    busy.current = false;
    if (r && r.ok && r.code) setSt({ data: r.code, offset: (r.now || Date.now()) - Date.now(), err: null });
    else setSt((s) => Object.assign({}, s, { err: (r && r.error) || "Could not load the code." }));
  }, deps);
  React.useEffect(() => { load(); }, [load]);
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, []);
  const d = st.data;
  if (!d) return { code: "", err: st.err, reload: load };
  const step = Math.floor((Date.now() + st.offset) / 1000 / (d.period || 30));
  if (step > d.step + 1 || (step === d.step + 1 && !busy.current)) {
    setTimeout(load, 0);
  }
  const code = step === d.step ? d.code : step === d.step + 1 ? d.next : d.code;
  return { code, err: st.err, reload: load };
}

export function LiveCode({ fetcher, deps, onCode, size }) {
  const { code } = useLiveCode(fetcher, deps);
  React.useEffect(() => { if (code && onCode) onCode(code); }, [code]);
  if (!code) return <span className="code-wait mono">··· ···</span>;
  return <A.TotpCode key={code} code={code} size={size} />;
}

export function SecretRow({ label, length, mono, reveal, copy, colorize, children }) {
  const [value, setValue] = React.useState(null);
  const [shown, setShown] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const t = React.useRef(null);
  React.useEffect(() => () => clearTimeout(t.current), []);
  const toggle = async () => {
    if (shown) { setShown(false); return; }
    if (value == null) {
      setBusy(true);
      const v = await reveal();
      setBusy(false);
      if (v == null) return;
      setValue(v);
    }
    setShown(true);
  };
  const doCopy = async () => {
    const ok = await copy();
    if (!ok) return;
    setCopied(true);
    clearTimeout(t.current);
    t.current = setTimeout(() => setCopied(false), 1600);
  };
  const multiline = shown && value && value.includes("\n");
  return (
    <div className="apm-sf">
      <div className="apm-sf-label"><span>{label}</span></div>
      <div className="apm-sf-body">
        {shown && value != null ? (
          <div key="v" className={cx("apm-sf-value", "is-revealing", (mono || colorize) && "is-mono", multiline && "is-multiline")} onClick={doCopy} title="Click to copy">{colorize ? <Colorized value={value} /> : value}</div>
        ) : (
          <div key="m" className="apm-sf-value is-masked" onClick={doCopy} title="Click to copy">{"•".repeat(Math.min(Math.max(length || 10, 8), 16))}</div>
        )}
        {children}
      </div>
      <div className="apm-sf-actions">
        <A.IconButton icon={shown ? "eye-off" : "eye"} label={shown ? "Hide" : "Reveal"} size="sm" onClick={toggle} disabled={busy} />
        <A.IconButton icon={copied ? "check" : "copy"} label={copied ? "Copied" : "Copy " + String(label).toLowerCase()} size="sm" tone={copied ? "success" : undefined} onClick={doCopy} />
      </div>
      {copied && <span className="apm-sf-copied" role="status"><A.Icon name="check" size={12} strokeWidth={2.25} />Copied</span>}
    </div>
  );
}

export function GenPanel({ initial, onChange, onUse, useLabel, useIcon, compact, onCopy, canUse }) {
  const [o, setO] = React.useState(() => Object.assign({}, GEN_DEFAULTS, initial || {}));
  const [v, setV] = React.useState(() => generate(Object.assign({}, GEN_DEFAULTS, initial || {})));
  const [spin, setSpin] = React.useState(0);
  const set = (p) => {
    const x = Object.assign({}, o, p);
    setO(x);
    setV(generate(x));
    setSpin((s) => s + 1);
    if (onChange) onChange(x);
  };
  const regen = () => { setV(generate(o)); setSpin((s) => s + 1); };
  const s = optionsStrength(v);
  return (
    <div className={cx("gen", compact && "is-compact")}>
      <div className="gen-out">
        <div className="gen-value mono" key={spin}><Colorized value={v} /></div>
        <div className="gen-out-actions">
          <A.IconButton icon="refresh-cw" label="Generate another" size="sm" onClick={regen} />
          {onCopy && <A.IconButton icon="copy" label="Copy" size="sm" onClick={() => onCopy(v)} />}
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
      {onUse && <A.Button variant="primary" block icon={useIcon || "check"} disabled={canUse === false} onClick={() => onUse(v)}>{useLabel || "Use password"}</A.Button>}
    </div>
  );
}

export function useSystemTheme() {
  React.useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
  }, []);
}

export function errorText(r, fallback) {
  if (!r) return fallback || "Something went wrong.";
  if (r.code === "offline") return "APM isn't connected. Open the APM app, or run pm extension link once.";
  if (r.code === "locked") return "APM is locked. Unlock it from the toolbar.";
  if (r.code === "readonly") return "This APM session is read-only.";
  return r.error || fallback || "Something went wrong.";
}
