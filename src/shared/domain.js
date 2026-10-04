const MULTI = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk", "nhs.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "asn.au", "id.au",
  "co.nz", "org.nz", "net.nz", "govt.nz", "ac.nz",
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "edu.in", "res.in", "gov.in", "nic.in",
  "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp", "gr.jp", "ad.jp", "ed.jp", "lg.jp",
  "com.br", "net.br", "org.br", "gov.br", "edu.br",
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
  "com.hk", "org.hk", "net.hk", "edu.hk", "gov.hk",
  "com.sg", "edu.sg", "gov.sg", "org.sg", "net.sg",
  "com.tw", "org.tw", "net.tw", "edu.tw", "gov.tw",
  "co.kr", "or.kr", "ne.kr", "go.kr", "ac.kr",
  "com.mx", "org.mx", "gob.mx", "edu.mx",
  "com.ar", "org.ar", "gob.ar",
  "com.tr", "org.tr", "gov.tr", "edu.tr",
  "co.za", "org.za", "gov.za", "ac.za",
  "com.my", "org.my", "gov.my", "edu.my",
  "com.ph", "gov.ph", "edu.ph",
  "com.pk", "org.pk", "gov.pk", "edu.pk",
  "co.id", "or.id", "go.id", "ac.id",
  "co.il", "org.il", "gov.il", "ac.il",
  "com.sa", "gov.sa", "edu.sa",
  "com.eg", "gov.eg", "edu.eg",
  "com.ng", "gov.ng", "edu.ng",
  "co.ke", "or.ke", "go.ke",
  "com.vn", "gov.vn", "edu.vn",
  "co.th", "or.th", "go.th", "ac.th",
  "com.ua", "gov.ua",
  "com.pl", "net.pl", "org.pl",
  "co.at", "or.at",
  "com.co", "gov.co",
  "com.pe", "gob.pe",
  "com.bd", "gov.bd",
  "com.np", "gov.np",
  "com.lk", "gov.lk"
]);

const PRIVATE = new Set([
  "github.io", "gitlab.io", "vercel.app", "netlify.app", "pages.dev", "workers.dev", "herokuapp.com", "web.app",
  "firebaseapp.com", "appspot.com", "blogspot.com", "azurewebsites.net", "cloudfront.net", "onrender.com",
  "fly.dev", "glitch.me", "replit.app", "repl.co", "surge.sh", "ngrok.io", "ngrok-free.app", "loca.lt",
  "s3.amazonaws.com", "amplifyapp.com", "railway.app", "deno.dev", "wixsite.com", "myshopify.com", "webflow.io",
  "notion.site", "carrd.co", "framer.app", "stackblitz.io", "codesandbox.io", "trycloudflare.com"
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isIp(host) {
  return IPV4.test(host) || host.includes(":") || /^\[.*\]$/.test(host);
}

export function parseUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw.replace(/^\/+/, "");
  try {
    const u = new URL(withScheme);
    if (!u.hostname) return null;
    return { href: u.href, origin: u.origin, protocol: u.protocol, host: u.host.toLowerCase(), hostname: u.hostname.toLowerCase().replace(/\.$/, ""), port: u.port, path: u.pathname };
  } catch (e) {
    return null;
  }
}

export function stripWww(host) {
  return String(host || "").replace(/^www\d?\./, "");
}

export function baseDomain(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h || isIp(h) || !h.includes(".")) return h;
  const parts = h.split(".");
  for (let take = 3; take >= 2; take--) {
    if (parts.length > take) {
      const suffix = parts.slice(-take).join(".");
      if (PRIVATE.has(suffix)) return parts.slice(-(take + 1)).join(".");
    }
  }
  const last2 = parts.slice(-2).join(".");
  if (PRIVATE.has(last2)) return parts.length > 2 ? parts.slice(-3).join(".") : h;
  if (MULTI.has(last2) && parts.length > 2) return parts.slice(-3).join(".");
  return last2;
}

export function siteOf(url) {
  const p = typeof url === "string" ? parseUrl(url) : url;
  if (!p) return "";
  return baseDomain(p.hostname);
}

export function matches(itemUrl, pageUrl, mode) {
  const a = parseUrl(itemUrl);
  const b = typeof pageUrl === "string" ? parseUrl(pageUrl) : pageUrl;
  if (!a || !b) return false;
  if (a.port && b.port && a.port !== b.port) return false;
  if (mode === "host") return stripWww(a.hostname) === stripWww(b.hostname);
  if (mode === "prefix") {
    const want = a.href.replace(/\/$/, "");
    return b.href.startsWith(want) || stripWww(a.hostname) === stripWww(b.hostname) && a.path === "/";
  }
  if (isIp(a.hostname) || isIp(b.hostname) || a.hostname === "localhost" || b.hostname === "localhost") return a.hostname === b.hostname && (a.port || "") === (b.port || "");
  return baseDomain(a.hostname) === baseDomain(b.hostname);
}

export function matchScore(itemUrl, pageUrl) {
  const a = parseUrl(itemUrl);
  const b = typeof pageUrl === "string" ? parseUrl(pageUrl) : pageUrl;
  if (!a || !b) return 0;
  if (a.hostname === b.hostname) return a.path !== "/" && b.path.startsWith(a.path) ? 4 : 3;
  if (stripWww(a.hostname) === stripWww(b.hostname)) return 3;
  return 1;
}

export function itemMatches(item, pageUrl, mode) {
  const urls = item.urls || [];
  let best = 0;
  for (const u of urls) if (matches(u, pageUrl, mode)) best = Math.max(best, matchScore(u, pageUrl));
  return best;
}

export function loginsFor(items, pageUrl, mode) {
  const page = typeof pageUrl === "string" ? parseUrl(pageUrl) : pageUrl;
  if (!page) return [];
  return items
    .filter((i) => i.type === "password")
    .map((i) => ({ i, s: itemMatches(i, page, mode) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || (y.i.fav ? 1 : 0) - (x.i.fav ? 1 : 0) || (y.i.used || 0) - (x.i.used || 0) || x.i.title.localeCompare(y.i.title))
    .map((x) => x.i);
}

export function otherItemsFor(items, pageUrl, mode) {
  const page = typeof pageUrl === "string" ? parseUrl(pageUrl) : pageUrl;
  if (!page) return [];
  return items.filter((i) => i.type !== "password" && i.type !== "totp" && itemMatches(i, page, mode) > 0);
}

export function rpAllowed(origin, rpId) {
  const o = parseUrl(origin);
  if (!o || !rpId) return false;
  const rp = String(rpId).toLowerCase();
  const secure = o.protocol === "https:" || (o.protocol === "http:" && (o.hostname === "localhost" || o.hostname === "127.0.0.1"));
  if (!secure) return false;
  if (rp === o.hostname) return true;
  if (!rp.includes(".")) return false;
  if (!o.hostname.endsWith("." + rp)) return false;
  if (MULTI.has(rp) || PRIVATE.has(rp)) return false;
  return true;
}

export function isSecurePage(url) {
  const p = typeof url === "string" ? parseUrl(url) : url;
  if (!p) return false;
  return p.protocol === "https:" || p.hostname === "localhost" || p.hostname === "127.0.0.1" || p.hostname.endsWith(".localhost");
}

export function isWebPage(url) {
  return /^https?:\/\//i.test(String(url || ""));
}
