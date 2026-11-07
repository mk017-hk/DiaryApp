import type { AppStateStatus } from 'react-native';

/**
 * How long the app has really been away, for deciding whether to lock.
 *
 * Only `background` starts the clock. iOS also reports `inactive` — and that
 * is what the Face ID prompt causes, along with every permission dialog, the
 * notification shade, Control Centre, and a glance at the app switcher. None
 * of those is the app being left. Counting them is what made "Immediately"
 * lock in a loop: Face ID unlocked the app, its prompt closing looked like a
 * return from the background, the app locked again, and the lock screen asked
 * for Face ID again.
 *
 * Leaving properly — another app, the home screen, the phone locked — always
 * passes through `background`, so nothing that should lock is missed. What the
 * app switcher shows while the app is `inactive` is covered separately by the
 * privacy cover.
 */
export class AwayClock {
  private leftAt: number | null = null;

  /**
   * Feeds an app state change in. Returns how long the app was away when it
   * comes back to the foreground after really leaving, or null otherwise.
   */
  change(next: AppStateStatus, now: number): number | null {
    if (next === 'background') {
      this.leftAt ??= now;
      return null;
    }
    if (next === 'active') {
      const since = this.leftAt;
      this.leftAt = null;
      return since === null ? null : now - since;
    }
    return null;
  }

  /**
   * Forgets any departure recorded so far.
   *
   * Called on every unlock: time spent away before the app was unlocked has
   * already been answered for by unlocking, and must not lock it again a
   * moment later.
   */
  reset(): void {
    this.leftAt = null;
  }
}
