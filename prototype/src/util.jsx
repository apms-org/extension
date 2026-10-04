export const A = window.APM;
export const cx = (...a) => a.filter(Boolean).join(" ");
export const n = (count, word, plural) => count + " " + (count === 1 ? word : plural || word + "s");

export function Colorized({ value, className }) {
  return <span className={cx("clr", className)}>{Array.from(String(value)).map((c, i) => <span key={i} className={/[0-9]/.test(c) ? "d" : /[^A-Za-z0-9]/.test(c) ? "s" : undefined}>{c}</span>)}</span>;
}

const WORDS = ["anchor", "basalt", "cedar", "delta", "ember", "fjord", "garnet", "harbor", "indigo", "juniper", "kestrel", "lantern", "meadow", "nectar", "orbit", "pepper", "quartz", "raven", "saffron", "tundra", "umber", "velvet", "willow", "yarrow", "zephyr", "copper", "falcon", "glacier", "hollow", "island", "jasper", "lichen", "marble", "nimbus", "otter", "pebble", "ripple", "summit", "thistle", "violet"];

const rand = (max) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % max; };

export function generate(o) {
  if (o.mode === "pin") return Array.from({ length: o.pinLength }, () => rand(10)).join("");
  if (o.mode === "passphrase") {
    const w = Array.from({ length: o.words }, () => { const s = WORDS[rand(WORDS.length)]; return o.capitalize ? s[0].toUpperCase() + s.slice(1) : s; });
    if (o.number) w[rand(w.length)] += rand(10);
    return w.join(o.separator);
  }
  let set = "";
  if (o.upper) set += o.avoidAmbiguous ? "ABCDEFGHJKLMNPQRSTUVWXYZ" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (o.lower) set += o.avoidAmbiguous ? "abcdefghijkmnopqrstuvwxyz" : "abcdefghijklmnopqrstuvwxyz";
  if (o.digits) set += o.avoidAmbiguous ? "23456789" : "0123456789";
  if (o.symbols) set += "!#$%&*+-=?@^_";
  if (!set) set = "abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: o.length }, () => set[rand(set.length)]).join("");
}

export function strength(o) {
  let bits;
  if (o.mode === "pin") bits = Math.round(o.pinLength * 3.32);
  else if (o.mode === "passphrase") bits = Math.round(o.words * Math.log2(7776) + (o.number ? 3 : 0));
  else {
    const pool = (o.upper ? 26 : 0) + (o.lower ? 26 : 0) + (o.digits ? 10 : 0) + (o.symbols ? 13 : 0) || 26;
    bits = Math.round(o.length * Math.log2(pool));
  }
  const score = bits < 30 ? 0 : bits < 50 ? 1 : bits < 70 ? 2 : bits < 90 ? 3 : 4;
  const detail = bits < 30 ? "cracked in seconds" : bits < 50 ? "cracked in days" : bits < 70 ? "cracked in years" : "centuries to crack";
  return { bits, score, detail };
}

export const GEN_DEFAULTS = { mode: "random", length: 20, upper: true, lower: true, digits: true, symbols: true, avoidAmbiguous: false, words: 5, separator: "-", capitalize: true, number: true, pinLength: 6 };

export const ToastCtx = React.createContext(() => {});
export const useToast = () => React.useContext(ToastCtx);

export function ToastHost({ children, className }) {
  const [t, setT] = React.useState(null);
  const push = React.useCallback((x) => setT(Object.assign({ key: Date.now() }, x)), []);
  React.useEffect(() => { if (!t || t.countdown) return; const id = setTimeout(() => setT(null), 2400); return () => clearTimeout(id); }, [t]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className={cx("toast-slot", className)} aria-live="polite">
        {t && <A.Toast key={t.key} title={t.title} description={t.description} tone={t.tone} icon={t.icon} countdown={t.countdown} onDone={() => setT(null)} />}
      </div>
    </ToastCtx.Provider>
  );
}

export function copyToast(push, what, secret, value) {
  try { A.copyText(value || ""); } catch (e) {}
  push(secret ? { title: "Copied " + what, countdown: 30 } : { title: "Copied " + what });
}

export function Overline({ children, count, action }) {
  return <div className="ovl"><span>{children}</span>{count != null && <span className="ovl-count">{count}</span>}{action}</div>;
}

export function Kbd({ keys }) {
  return <A.Kbd keys={keys} />;
}
