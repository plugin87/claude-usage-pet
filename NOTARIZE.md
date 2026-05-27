# Notarizing Claude Usage Pet (zero-warning distribution)

The build pipeline is already wired for notarization (hardened runtime +
entitlements + `notarize: true` in `package.json`). You only need to do the
Apple-account parts once, then run one build command.

## One-time setup (you must do these — they need your Apple ID + payment)

1. **Enroll in the Apple Developer Program** — https://developer.apple.com/programs
   ($99/year, needs your Apple ID + identity verification; approval can take a
   few hours to ~2 days).

2. **Create a "Developer ID Application" certificate** (this is what signs apps
   for distribution outside the App Store):
   - Easiest: open **Xcode → Settings → Accounts → (your Apple ID) → Manage
     Certificates → "+" → Developer ID Application**. It installs into your login
     Keychain automatically.
   - Verify it's there:
     ```bash
     security find-identity -v -p codesigning | grep "Developer ID Application"
     ```

3. **Find your Team ID** — https://developer.apple.com/account → Membership →
   *Team ID* (10 characters, e.g. `AB12CD34EF`).

4. **Create an app-specific password** for the notarization service —
   https://appleid.apple.com → Sign-In & Security → App-Specific Passwords →
   generate one (looks like `abcd-efgh-ijkl-mnop`).

## Build (run this whenever you want to ship)

Set the credentials as environment variables (don't hard-code them in files),
then build. The signing cert is picked up from your Keychain automatically.

```bash
export APPLE_ID="pannana1198@gmail.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="AB12CD34EF"

npm run dist:mac          # signs (Developer ID) → notarizes → staples
```

electron-builder will: code-sign with your Developer ID, upload to Apple's
notary service, wait for the "accepted" ticket, and staple it to the app/dmg.
The result in `dist/` opens with **no warning on any Mac** — no right-click, no
Terminal, nothing.

Verify the output:
```bash
spctl -a -vvv "dist/mac-universal/Claude Usage Pet.app"   # should say: accepted, source=Notarized Developer ID
xcrun stapler validate "dist/Claude Usage Pet-1.0.0-universal.dmg"
```

## Notes

- **Do not** set `CSC_IDENTITY_AUTO_DISCOVERY=false` for the mac build — that
  disables Developer ID signing (it's only used for the unsigned Windows build).
- First notarization of a build can take a few minutes (Apple's queue).
- Windows has no equivalent free fix; recipients still click "More info → Run
  anyway" past SmartScreen (or you'd buy a separate code-signing cert).
- Until you finish step 1–4, the app still works locally and via the
  "Open Anyway / `xattr -cr`" workaround for shared copies.
