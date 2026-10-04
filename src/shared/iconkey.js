import { parseUrl, isIp } from "./domain.js";

export function iconHost(item) {
  const list = (item && item.urls) || [];
  for (const u of list) {
    const h = hostKey(u);
    if (h) return h;
  }
  return "";
}

export function hostKey(u) {
  const p = parseUrl(u);
  if (!p || !/^https?:$/.test(p.protocol)) return "";
  const h = p.hostname.replace(/^www\d?\./, "");
  if (!h.includes(".") || isIp(h) || h === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(h)) return "";
  return h;
}
