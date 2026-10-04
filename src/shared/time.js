export function ago(ts, now) {
  if (!ts) return "";
  const d = ((now || Date.now()) - ts) / 1000;
  if (d < 45) return "now";
  if (d < 3600) return Math.round(d / 60) + "m";
  if (d < 86400) return Math.round(d / 3600) + "h";
  const dt = new Date(ts);
  if (d < 86400 * 6) return dt.toLocaleDateString("en-US", { weekday: "short" });
  if (d < 86400 * 300) return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function agoLong(ts, now) {
  if (!ts) return "never";
  const d = ((now || Date.now()) - ts) / 1000;
  if (d < 45) return "just now";
  if (d < 3600) { const m = Math.round(d / 60); return m + " minute" + (m === 1 ? "" : "s") + " ago"; }
  if (d < 86400) { const x = Math.round(d / 3600); return x + " hour" + (x === 1 ? "" : "s") + " ago"; }
  const days = Math.round(d / 86400);
  if (days < 30) return days + " day" + (days === 1 ? "" : "s") + " ago";
  return date(ts);
}

export function date(ts) {
  return !ts ? "" : new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function group(ts, now) {
  if (!ts) return "Earlier";
  const n = new Date(now || Date.now());
  const start = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  if (ts >= start) return "Today";
  if (ts >= start - 86400000 * 6) return "This week";
  if (ts >= start - 86400000 * 30) return "This month";
  return "Earlier";
}

export const GROUPS = ["Today", "This week", "This month", "Earlier"];

export const n = (c, w, pl) => c + " " + (c === 1 ? w : pl || w + "s");
