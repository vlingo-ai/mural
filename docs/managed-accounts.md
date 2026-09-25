# How to enable optional sign-in on iPhone

Follow the [accepted baseline](web-ios-model-gateway-plan.md). Phase 6 uses this fork's own
App/Bundle ID, Google Cloud project and iOS OAuth client; Web staging has a separate Web client.
This guide does not enable payments/trials. Existing native BYOK mode remains independent.

The September 12 iPhone login record belongs to upstream history, not this fork's Phase 6 app.
It does not establish whether this user's earlier test used a simulator or physical iPhone.
Verify new-app login, persistence, logout and deletion independently. Apple needs separate setup.

## Enable Google

1. Deploy the account service using the [server setup guide](../services/api/docs/enable-accounts.md). Use an HTTPS origin with no path, query, fragment or embedded credentials. Confirm the server's `/v1/auth/providers` response enables Google before distributing a configured app.
2. Create a Google OAuth client of type **iOS** for the app's bundle ID. Set the server's `GOOGLE_IOS_CLIENT_ID` to the same value. This flow uses the native client's audience and requires no Google client secret. Configure the OAuth consent screen for your intended users.
3. Add these public values to the ignored `apps/ios/Config/Local.xcconfig`, preserving its existing signing settings:

```xcconfig
MURAL_MANAGED_ACCOUNTS_ENABLED = YES
MURAL_MANAGED_API_URL = https:/$()/api-speaking-live-staging.vlingo.ai
MURAL_GOOGLE_SIGN_IN_ENABLED = YES
MURAL_GOOGLE_CLIENT_ID = YOUR_OWN_IOS_CLIENT_ID.apps.googleusercontent.com
MURAL_GOOGLE_CALLBACK_SCHEME = YOUR_REVERSED_IOS_CLIENT_ID
MURAL_APPLE_SIGN_IN_ENABLED = NO
MURAL_APPLE_SWIFT_FLAGS =
MURAL_APPLE_ENTITLEMENTS =
```

Replace placeholders after choosing the new Bundle ID. The server variable is
`GOOGLE_IOS_CLIENT_ID`; the existing Xcode key remains `MURAL_GOOGLE_CLIENT_ID`.
Do not reuse upstream's `mural-508413` project/client. Keep `https:/$()/` so xcconfig does not
interpret `//` as a comment.

4. Build and run the app using the [iPhone setup guide](run-on-iphone.md). Preserve the installed app's bundle ID and development team when updating it. `apps/ios/Config/Signing.xcconfig` loads the checked-in defaults from `apps/ios/Config/ManagedAccounts.xcconfig`, then applies the local overrides.
5. Open **Settings → Account**. Confirm Google appears, Apple is absent, and the terms agreement and privacy acknowledgment are visible above the button. The registered callback is the reversed client ID followed by `:/oauth2redirect`, with one slash.
6. Complete Google sign-in on the phone. Confirm the signed-in provider and verified email, when supplied, match the intended account. The app fetches `GET /v1/account` and validates its account ID against the active Mural session. It does not fetch or display a wallet in this release.

Client IDs are public configuration. Keep OAuth secrets, Apple signing keys, OpenAI service keys and database credentials on the server. Do not add them to Info.plist, app resources or `apps/ios/Config/ManagedAccounts.xcconfig`.

## Enable Apple when enrollment is approved

Upstream enrollment does not establish this fork's access. Keep Apple disabled until your own
developer account, provisioning and server revocation setup are ready.

1. Enable **Sign in with Apple** for the app identifier on the enrolled Apple Developer team. Regenerate a matching provisioning profile. Coordinate any signing-team change before updating the existing personal installation.
2. Configure the server's `APPLE_CLIENT_ID` with the app's bundle ID, plus its team ID, key ID and private key file. Follow the [server instructions](../services/api/docs/enable-accounts.md) and complete authorization revocation checks before offering Apple signup.
3. Set these local build values:

```xcconfig
MURAL_APPLE_SIGN_IN_ENABLED = YES
MURAL_APPLE_SWIFT_FLAGS = MURAL_SIGN_IN_WITH_APPLE
MURAL_APPLE_ENTITLEMENTS = App/SignInWithApple.entitlements
```

The bundled entitlement requests `com.apple.developer.applesignin` with `Default`. The compilation condition asserts that the configured build has that entitlement and an eligible profile; the app does not inspect private signing APIs. The Apple client ID in Info.plist follows `PRODUCT_BUNDLE_IDENTIFIER`.

4. Build, verify the signed entitlement and provisioning profile, then complete Apple sign-in and account deletion on a device. Confirm deletion revokes Apple authorization before enabling the button for other users.

To use Apple alone, set `MURAL_GOOGLE_SIGN_IN_ENABLED = NO`. Each provider is gated independently. Adding a provider preserves existing Mural sessions for the same backend origin and app bundle ID.

## Verify before sharing the build

Run the offline account checks:

```sh
swift test --package-path apps/ios --filter ManagedAccountTests
```

These cover provider configuration, PKCE S256, callback validation, session expiry and scoping, profile identity binding, exact wallet arithmetic and cancellation. Wallet arithmetic remains tested foundation code; it does not enable a purchase flow. The tests use synthetic values and make no network calls.

Then verify the configured device:

- Complete and cancel Google sign-in. The system authentication session is ephemeral, so it may request a login even when Safari is already signed in.
- Close Account during sign-in and confirm no late completion restores a cancelled session. Reject reused challenges and callbacks from an earlier attempt.
- Relaunch and confirm the Mural session persists in its separate Keychain record. Only the Mural session, account ID, provider, expiry and backend/app scope are saved there. It uses `WhenUnlockedThisDeviceOnly`, does not sync through iCloud Keychain, and does not access the OpenAI key.
- Sign out and verify the old server session is rejected. If offline, confirm the message distinguishes local sign-out from server revocation; Mural sessions expire within 24 hours.
- Delete a disposable account and confirm server deletion before the app reports success. Saved learning history must remain on the phone. When Apple is enabled, also verify the fresh-code authorization revocation path.
- Confirm account creation grants no credits or free trial and leaves BYOK conversations available without sign-in. Keep hosted voice, wallet and payment routes behind the server's commercial gate.

Preview and UI-test launches using `--preview` do not load account credentials or perform sign-in requests. They can verify the account layout, but cannot establish that Google or Apple authorization works. Record real login, persistence, sign-out and deletion results separately in the [verification log](../verification/validation.md).

## Related references

The [account API reference](../services/api/docs/accounts-reference.md) defines challenge, exchange, profile, sign-out and deletion payloads, nonce handling, retention and errors. The native client uses OAuth authorization code with PKCE and state for Google, and `ASAuthorizationController` with state for Apple. Provider tokens and authorization codes stay in memory; the server verifies them before issuing a Mural session.

Provider documentation: [Google installed-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Sign in with Apple](https://developer.apple.com/documentation/authenticationservices/implementing-user-authentication-with-sign-in-with-apple), and Apple's [nonce](https://developer.apple.com/documentation/authenticationservices/asauthorizationopenidrequest/nonce) and [state](https://developer.apple.com/documentation/authenticationservices/asauthorizationopenidrequest/state) properties.

The Google button uses the unmodified light iOS pill PNG at 3× resolution from Google's [approved artwork](https://developers.google.com/static/identity/images/signin-assets.zip), downloaded 12 September 2026. Follow [Google's branding guidelines](https://developers.google.com/identity/branding-guidelines). Google retains its trademarks and artwork rights; Mural's MIT license does not grant rights to those marks. Bundled third-party notices remain available in **Settings → Open-source notices**.
