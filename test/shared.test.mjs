import test from "node:test";
import assert from "node:assert/strict";
import { baseDomain, matches, loginsFor, rpAllowed, isSecurePage, isWebPage, parseUrl, otherItemsFor } from "../src/shared/domain.js";
import { generate, entropy, score, optionsStrength, GEN_DEFAULTS, WORDS } from "../src/shared/gen.js";
import { withDefaults, excludedRule, DEFAULTS } from "../src/shared/settings.js";
import { toB64u, fromB64u, sha256 } from "../src/shared/b64.js";
import { n, group, ago } from "../src/shared/time.js";
import { getType, TYPES } from "../src/shared/types.js";

test("base domain handles public and private suffixes", () => {
  assert.equal(baseDomain("app.harbor.dev"), "harbor.dev");
  assert.equal(baseDomain("login.bbc.co.uk"), "bbc.co.uk");
  assert.equal(baseDomain("aarav.github.io"), "aarav.github.io");
  assert.equal(baseDomain("docs.aarav.github.io"), "aarav.github.io");
  assert.equal(baseDomain("127.0.0.1"), "127.0.0.1");
  assert.equal(baseDomain("localhost"), "localhost");
});

test("matching modes", () => {
  assert.ok(matches("harbor.dev", "https://app.harbor.dev/login", "domain"));
  assert.ok(!matches("harbor.dev", "https://app.harbor.dev/login", "host"));
  assert.ok(matches("www.harbor.dev", "https://harbor.dev/login", "host"));
  assert.ok(matches("https://harbor.dev/admin", "https://harbor.dev/admin/login", "prefix"));
  assert.ok(!matches("https://harbor.dev/admin", "https://harbor.dev/billing", "prefix"));
  assert.ok(!matches("alice.github.io", "https://mallory.github.io", "domain"));
  assert.ok(!matches("http://localhost:3000", "http://localhost:4000/login", "domain"));
  assert.ok(matches("http://localhost:3000", "http://localhost:3000/login", "domain"));
});

test("logins for a page are ranked and only logins", () => {
  const items = [
    { id: "a", type: "password", title: "Harbor", urls: ["harbor.dev"], used: 1 },
    { id: "b", type: "password", title: "Harbor admin", urls: ["https://app.harbor.dev/admin"], used: 0 },
    { id: "c", type: "password", title: "Harbor work", urls: ["harbor.dev"], fav: true },
    { id: "d", type: "apikey", title: "Harbor API", urls: ["harbor.dev"] },
    { id: "e", type: "password", title: "Npm", urls: ["npmjs.com"] }
  ];
  assert.deepEqual(loginsFor(items, "https://app.harbor.dev/admin/login", "domain").map((i) => i.id), ["b", "c", "a"]);
  assert.deepEqual(otherItemsFor(items, "https://harbor.dev", "domain").map((i) => i.id), ["d"]);
  assert.deepEqual(loginsFor(items, "chrome://settings", "domain"), []);
});

test("rpId must belong to the calling origin", () => {
  assert.ok(rpAllowed("https://login.harbor.dev", "harbor.dev"));
  assert.ok(rpAllowed("https://harbor.dev", "harbor.dev"));
  assert.ok(rpAllowed("http://localhost:5173", "localhost"));
  assert.ok(!rpAllowed("https://evil.dev", "harbor.dev"));
  assert.ok(!rpAllowed("https://harbor.dev.evil.dev", "harbor.dev"));
  assert.ok(!rpAllowed("https://bbc.co.uk", "co.uk"));
  assert.ok(!rpAllowed("https://alice.github.io", "github.io"));
  assert.ok(!rpAllowed("http://harbor.dev", "harbor.dev"));
  assert.ok(!rpAllowed("https://harbor.dev", ""));
});

test("page gates", () => {
  assert.ok(isSecurePage("https://harbor.dev"));
  assert.ok(isSecurePage("http://localhost:8080"));
  assert.ok(!isSecurePage("http://harbor.dev"));
  assert.ok(isWebPage("https://harbor.dev"));
  assert.ok(!isWebPage("chrome://extensions"));
  assert.equal(parseUrl("harbor.dev/login").hostname, "harbor.dev");
  assert.equal(parseUrl(""), null);
});

test("generator honours options", () => {
  const pw = generate(GEN_DEFAULTS);
  assert.equal(pw.length, 20);
  assert.match(pw, /[A-Z]/);
  assert.match(pw, /[a-z]/);
  assert.match(pw, /[0-9]/);
  assert.match(pw, /[^A-Za-z0-9]/);
  assert.match(generate({ mode: "pin", pinLength: 8 }), /^\d{8}$/);
  const phrase = generate({ mode: "passphrase", words: 5, capitalize: true, number: false });
  assert.equal(phrase.split("-").length, 5);
  assert.doesNotMatch(generate({ length: 64, avoidAmbiguous: true }), /[Il1O0o|`'"]/);
  assert.equal(generate({ length: 12, upper: false, lower: false, digits: false, symbols: false }).length, 12);
});

test("strength scoring", () => {
  assert.equal(score(entropy("password1")), 0);
  assert.ok(entropy("Lq7!vT2#pZ9xKm4wRe") > 100);
  assert.equal(optionsStrength("Lq7!vT2#pZ9xKm4wRe").score, 4);
  assert.equal(optionsStrength("anchor-basalt-cedar-delta-ember").bits, Math.round(5 * Math.log2(WORDS.length)));
});

test("settings defaults and excluded rules", () => {
  assert.equal(withDefaults({ inlineMenu: false }).inlineMenu, false);
  assert.equal(withDefaults(null).matchMode, DEFAULTS.matchMode);
  const list = [{ host: "harbor.dev", rule: "save" }, { host: "bank.com", rule: "both" }];
  assert.equal(excludedRule(list, "app.harbor.dev"), "save");
  assert.equal(excludedRule(list, "harbor.dev"), "save");
  assert.equal(excludedRule(list, "notharbor.dev"), null);
  assert.equal(excludedRule(list, "BANK.com"), "both");
});

test("base64url round trip and sha256", async () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
  const s = toB64u(bytes);
  assert.doesNotMatch(s, /[+/=]/);
  assert.deepEqual(Array.from(fromB64u(s)), Array.from(bytes));
  assert.equal(toB64u(await sha256("abc")), "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
});

test("time helpers", () => {
  assert.equal(n(1, "item"), "1 item");
  assert.equal(n(3, "item"), "3 items");
  assert.equal(n(2, "passkey"), "2 passkeys");
  const now = Date.now();
  assert.equal(group(now, now), "Today");
  assert.equal(group(now - 86400000 * 40, now), "Earlier");
  assert.equal(ago(now - 10000, now), "now");
});

test("item types cover the vault", () => {
  assert.ok(TYPES.length >= 20);
  assert.equal(getType("password").label.length > 0, true);
});

import { hostKey, iconHost } from "../src/shared/iconkey.js";

test("icon keys", () => {
  assert.equal(hostKey("https://www.github.com/login"), "github.com");
  assert.equal(hostKey("mail.google.com"), "mail.google.com");
  assert.equal(hostKey("http://localhost:5391"), "");
  assert.equal(hostKey("192.168.1.1"), "");
  assert.equal(hostKey("router.local"), "");
  assert.equal(iconHost({ urls: ["localhost:3000", "https://vercel.com"] }), "vercel.com");
  assert.equal(iconHost({ urls: [] }), "");
});
