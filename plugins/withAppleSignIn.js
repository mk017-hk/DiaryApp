const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Keeps the Sign in with Apple entitlement only when it is asked for.
 *
 * `expo-apple-authentication` is one of the packages Expo applies
 * automatically, and its plugin adds `com.apple.developer.applesignin`
 * unconditionally. A free Apple ID cannot sign an app carrying that
 * entitlement — Xcode refuses outright — so without this a local build on a
 * phone fails before it starts. See `app.config.ts` for the flag.
 *
 * A file rather than an inline function because Expo's config types only
 * allow a plugin by path. Registered last in the plugins list so it sees the
 * entitlement the auto-applied plugin adds; that ordering was checked against
 * the generated entitlements file rather than assumed.
 */
module.exports = function withAppleSignIn(config, { enabled = false } = {}) {
  return withEntitlementsPlist(config, (mod) => {
    if (!enabled) delete mod.modResults['com.apple.developer.applesignin'];
    return mod;
  });
};
