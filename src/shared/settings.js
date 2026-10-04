export const KEYS = { token: "apm.token", settings: "apm.settings", excluded: "apm.excluded", gen: "apm.gen", space: "apm.space", hints: "apm.rpHints", paired: "apm.paired", port: "apm.port" };

export const DEFAULTS = {
  inlineMenu: true,
  fieldIcon: true,
  suggestPasswords: true,
  fillTotpAfterLogin: true,
  offerSave: true,
  offerUpdate: true,
  saveSpace: "",
  matchMode: "domain",
  passkeys: true,
  passkeysInMenu: true,
  neverHttp: true,
  crossFrames: false,
  lockOnClose: false
};

export const RULES = { fill: "Never fill", save: "Never save", both: "Never fill or save" };

export const PORT = 41417;

export const NATIVE_HOST = "dev.apm.bridge";

export const LINK_CMD = "pm extension link";

export function withDefaults(s) {
  return Object.assign({}, DEFAULTS, s || {});
}

export function excludedRule(list, host) {
  const h = String(host || "").toLowerCase();
  if (!h) return null;
  for (const x of list || []) {
    const e = String(x.host || "").toLowerCase();
    if (h === e || h.endsWith("." + e)) return x.rule;
  }
  return null;
}
