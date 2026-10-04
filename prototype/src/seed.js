export const TYPES = {
  login: { label: "Logins", one: "Login", icon: "globe" },
  totp: { label: "Authenticator", one: "One-time code", icon: "timer" },
  apikey: { label: "API keys", one: "API key", icon: "key-round" },
  ssh: { label: "SSH keys", one: "SSH key", icon: "terminal" },
  cloud: { label: "Cloud credentials", one: "Cloud credential", icon: "cloud" },
  card: { label: "Cards", one: "Card", icon: "credit-card" },
  identity: { label: "Identities", one: "Identity", icon: "id-card" },
  wifi: { label: "Wi-Fi", one: "Wi-Fi network", icon: "wifi" },
  note: { label: "Secure notes", one: "Secure note", icon: "sticky-note" }
};

export const SPACES = [
  { id: "personal", name: "Personal" },
  { id: "work", name: "Work" }
];

export const SITE = { host: "harbor.dev", name: "Harbor", path: "/login" };

export const ITEMS = [
  { id: "harbor-me", type: "login", title: "Harbor", user: "aarav@maloo.dev", password: "t7#Qm-Rv2pLx9!ke", url: "harbor.dev", space: "personal", totp: "JBSWY3DPEHPK3PXP", fav: true, used: "2m", group: "Today", reused: ["npm"], score: 3, bits: 84, changed: "Changed 214 days ago", created: "Created Mar 4, 2025", passkeys: [{ id: "pk-harbor", user: "aarav@maloo.dev", created: "Aug 14, 2026", used: "2d" }] },
  { id: "harbor-work", type: "login", title: "Harbor", user: "aarav@northwind.io", password: "Vq9!zR4#mK2wLp7sYd", url: "harbor.dev", space: "work", totp: "KRSXG5CTMVRXEZLU", used: "Tue", group: "This week", score: 4, bits: 112, changed: "Changed 41 days ago", created: "Created Jan 9, 2026", passkeys: [] },
  { id: "harbor-token", type: "apikey", title: "Harbor deploy token", user: "northwind/api · read, write", secret: "hbr_live_7Kq2Vx9mR4tLp8Zc3Nw6", url: "harbor.dev", space: "work", used: "Sep 12", group: "Earlier", created: "Created Sep 12, 2026" },
  { id: "github", type: "login", title: "GitHub", user: "aaravmaloo", password: "Gh!4vN8q-Tz2Lm6wPx", url: "github.com", space: "personal", totp: "GEZDGNBVGY3TQOJQ", fav: true, used: "18m", group: "Today", score: 4, bits: 106, changed: "Changed 62 days ago", created: "Created Nov 2, 2023", passkeys: [{ id: "pk-gh", user: "aaravmaloo", created: "Jun 3, 2026", used: "5d" }] },
  { id: "stripe", type: "login", title: "Stripe", user: "aarav@northwind.io", password: "S7r!pe-Kq4Vm9xLw2", url: "dashboard.stripe.com", space: "work", totp: "MFRGGZDFMZTWQ2LK", used: "1h", group: "Today", score: 4, bits: 98, changed: "Changed 30 days ago", created: "Created Feb 1, 2026" },
  { id: "aws", type: "cloud", title: "AWS northwind-prod", user: "AKIA4NW7QK2M9XRT5LPE", secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYNWPROD7Q", url: "console.aws.amazon.com", space: "work", used: "Mon", group: "This week", created: "Created Oct 20, 2025" },
  { id: "notion", type: "login", title: "Notion", user: "aarav@maloo.dev", password: "sunset-Harbor-42", url: "notion.so", space: "personal", used: "Mon", group: "This week", reused: ["Spotify"], score: 2, bits: 52, changed: "Changed 1 year ago", created: "Created Apr 18, 2024" },
  { id: "spotify", type: "login", title: "Spotify", user: "aarav.maloo@gmail.com", password: "sunset-Harbor-42", url: "spotify.com", space: "personal", used: "Sun", group: "This week", reused: ["Notion"], score: 2, bits: 52, changed: "Changed 1 year ago", created: "Created Apr 18, 2024" },
  { id: "npm", type: "login", title: "npm", user: "aaravmaloo", password: "t7#Qm-Rv2pLx9!ke", url: "npmjs.com", space: "personal", used: "Sep 20", group: "Earlier", reused: ["Harbor"], score: 3, bits: 84, changed: "Changed 214 days ago", created: "Created Mar 4, 2025" },
  { id: "google", type: "login", title: "Google", user: "aarav.maloo@gmail.com", password: "Qe8$wTz3!Nv6pLc1Ra", url: "accounts.google.com", space: "personal", totp: "NBSWY3DPO5XXE3DE", used: "3h", group: "Today", score: 4, bits: 110, changed: "Changed 90 days ago", created: "Created Jul 7, 2022" },
  { id: "cloudflare", type: "login", title: "Cloudflare", user: "ops@northwind.io", password: "cF-9mK!2xVq7Lw4zTn", url: "dash.cloudflare.com", space: "work", totp: "ORSXG5DJNZTXIZLT", used: "Sep 18", group: "Earlier", score: 4, bits: 104, changed: "Changed 20 days ago", created: "Created Aug 3, 2025" },
  { id: "vercel", type: "login", title: "Vercel", user: "aarav@northwind.io", password: "Vr!3kP9wQz-L6mT2x", url: "vercel.com", space: "work", used: "Wed", group: "This week", score: 4, bits: 96, changed: "Changed 75 days ago", created: "Created Dec 12, 2025" },
  { id: "figma", type: "login", title: "Figma", user: "aarav@maloo.dev", password: "fG7!mQ2-vK9zL4wRp", url: "figma.com", space: "personal", used: "Sep 9", group: "Earlier", score: 4, bits: 94, changed: "Changed 120 days ago", created: "Created May 6, 2025" },
  { id: "discord", type: "login", title: "Discord", user: "aarav#0412", password: "discord2019", url: "discord.com", space: "personal", used: "Aug 30", group: "Earlier", weak: true, score: 1, bits: 31, changed: "Changed 6 years ago", created: "Created Jan 2, 2019" },
  { id: "wifi", type: "wifi", title: "Maloo 5G", user: "WPA3 · Home router", secret: "quiet-lantern-harbor-88", space: "personal", used: "Aug 22", group: "Earlier", created: "Created Jun 1, 2024" },
  { id: "card", type: "card", title: "HDFC Millennia", user: "Visa · 4417", secret: "4417 1234 5678 4417", space: "personal", used: "Sep 26", group: "This week", created: "Created Feb 14, 2025" },
  { id: "passport", type: "identity", title: "Passport", user: "Aarav Maloo · expires 2033", secret: "Z4418207", space: "personal", used: "Jul 11", group: "Earlier", created: "Created Jul 11, 2024" },
  { id: "router", type: "note", title: "Router admin", user: "192.168.1.1 · recovery steps", secret: "Hold reset 10s, then sign in with the sticker password.", space: "personal", used: "Jun 2", group: "Earlier", created: "Created Jun 2, 2024" },
  { id: "ssh", type: "ssh", title: "macbook-2025", user: "ed25519 · SHA256:q4Vx…9mRt", secret: "-----BEGIN OPENSSH PRIVATE KEY-----", space: "personal", used: "Sep 24", group: "This week", created: "Created Jan 20, 2025" },
  { id: "webauthn", type: "login", title: "webauthn.io", user: "aarav", password: "", url: "webauthn.io", space: "personal", used: "Sep 1", group: "Earlier", created: "Created Sep 1, 2026", passkeys: [{ id: "pk-wa", user: "aarav", created: "Sep 1, 2026", used: "Sep 1" }] }
];

export const CAPTURE = { rp: "webauthn.io", user: "aarav", alg: "ES256", at: "1m" };

export const EXCLUDED = [
  { host: "netbanking.hdfcbank.com", rule: "Never save" },
  { host: "localhost:5173", rule: "Never fill" },
  { host: "intranet.northwind.io", rule: "Never fill" }
];

export const VAULT_META = { app: "APM 2.4.1", ext: "1.0.0", port: 41417, paired: "Paired Sep 18, 2026", cipher: "XChaCha20-Poly1305", kdf: "Argon2id", idle: 15 };
