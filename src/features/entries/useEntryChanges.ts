import { useEffect, useRef } from 'react';

import { subscribeToEntries } from './entryStore';

/**
 * Runs `onChange` whenever entries change anywhere in the app.
 *
 * Screens load on focus, which was enough while every write came from a tap on
 * that same screen. A sync pass lands while you are looking at Today, so
 * without this the entry you wrote on your other phone sits on the device and
 * does not appear until you navigate away and back.
 *
 * The callback is held in a ref, so a screen can pass a fresh closure on every
 * render without resubscribing each time — and without having to wrap its
 * loader in a `useCallback` whose dependency list then has to be kept honest.
 */
export function useEntryChanges(onChange: () => void): void {
  const latest = useRef(onChange);

  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => subscribeToEntries(() => latest.current()), []);
}
