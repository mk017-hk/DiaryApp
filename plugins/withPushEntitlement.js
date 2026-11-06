const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Keeps the push notification entitlement only when it is asked for.
 *
 * `expo-notifications` is applied automatically, and its plugin adds
 * `aps-environment` to the entitlements. A free Apple ID cannot sign an app
 * carrying it — "Personal development teams do not support the Push
 * Notifications capability" — so without this, installing the notifications
 * package would break every local build on a phone, exactly as Sign in with
 * Apple did.
 *
 * The app's reminders are local notifications, scheduled on the phone, and
 * need no entitlement at all. Push is only for messages sent from a server,
 * which nothing does yet. `PUSH_NOTIFICATIONS=1` turns it back on once there
 * is a paid account and a reason. Registered last, like the Apple plugin, so
 * it runs after the entitlement has been added; checked against the generated
 * entitlements file.
 */
module.exports = function withPushEntitlement(config, { enabled = false } = {}) {
  return withEntitlementsPlist(config, (mod) => {
    if (!enabled) delete mod.modResults['aps-environment'];
    return mod;
  });
};
