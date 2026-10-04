# APM for Chrome

Fill logins, one-time codes and passkeys from your APM vault, in any Chromium browser.

The extension never opens `vault.dat` and never holds your master password or a private key. It talks to the APM app (or `pm bridge serve`) on `127.0.0.1:41417`, or, when the app is closed, to `pm` itself through Chrome native messaging. Whichever answers decrypts, fills and signs on its behalf.

## Install

```sh
npm install
npm run build
```

Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `extension/dist`.

## Connect

Open the APM app, or run `pm extension link` once in a terminal. The extension finds it and asks to pair on its own:

- APM shows a short code and the browser's name. Check that the popup shows the same code, then choose **Connect** in APM (or answer `y` at the `pm extension link` or `pm bridge serve` prompt). There is nothing to paste.
- `pm extension link` registers `pm` as the native messaging host `dev.apm.bridge` for the pinned extension ID in every Chromium browser it finds. After that, whenever the app is closed the browser starts `pm` on its own, and the extension sends the same requests over the native port (answers over 512 KiB arrive in parts). The port stays open while the vault is unlocked through `pm`, because `pm` holds the key only while it runs, and closes 30 seconds after the vault locks. When the app opens again, the extension switches back to it within 5 seconds and lets `pm` exit. The vault locks on the auto-lock policy from `pm autolock` or the app's Settings, Sessions.
- `pm bridge token --show` prints the token for manual pairing from the extension settings, under Connection.
- The build pins the extension ID `ioooalainhfihaebgpbmngoaojmfdlac` through the manifest `key`, so the ID stays the same on every machine. The extension already accepts a token returned straight from `/api/pair/start`, so a bridge that trusts that ID can skip the code.

## What it does

- Toolbar popup: logins for this site, the whole vault by space and type, live one-time codes, the password generator, passkeys, unlock with password or Touch ID.
- Website logos: the popup, the menu on the page and the passkey sheets show each site's logo, fetched by the APM app from the site itself and cached. Logins can hold several websites; add one from the popup, or choose Fill and remember when a login is saved for another site.
- On the page: a menu under login, one-time code and new password fields, the APM mark inside fields, save and update prompts after you sign in, and passkey sheets. All of it renders in extension frames inside closed shadow roots, so the page cannot read it.
- Passkeys: APM creates and signs with P-256 keys stored in the vault. The extension builds `clientDataJSON` from the real frame origin and refuses an `rpId` that does not belong to it.
- Shortcuts: `Alt+Shift+A` opens APM, `Alt+Shift+F` fills the best login, `Alt+Shift+G` fills a strong password, `Alt+Shift+L` locks. Copying the one-time code has no default key; set one at `chrome://extensions/shortcuts`.
- Right-click any text field and choose APM to fill a login, a code or a strong password.

## Develop

```sh
npm run build:watch        # rebuild on change
npm test                   # unit tests for matching, generator, settings, encoding
npm run ds:sync            # copy the design system from ../design-system into vendor/
npm run icons              # render the toolbar icons
npm run zip                # dist plus apm-extension-<version>.zip
node scripts/build.mjs --port=41533 --out=/tmp/apm-ext   # a build that looks for APM on another port
```

The UI uses the APM design system (`vendor/design-system`) with React from the same folder. The styles for every surface (the popup, the menu on the page, the prompts, the passkey sheets and the options page) come from the design system's `patterns/extension.css`; `src/ui/css/ui.css` only sizes the pages. Change a surface in the design system, then run `npm run ds:sync`. Nothing is fetched from the network.

`prototype/` holds the clickable design prototype. It is not shipped.
