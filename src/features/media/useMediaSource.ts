import { useEffect, useMemo, useState } from 'react';

import { signedUrlFor } from '@/services/supabase/media';

import { recordingExists } from './videoStorage';

export type MediaSource =
  /** Still resolving. Nothing should render a player yet. */
  | { state: 'resolving' }
  /** A file on this device, or a freshly minted URL for one in the bucket. */
  | { state: 'ready'; uri: string; local: boolean }
  /** Neither here nor there. Say so rather than showing a broken player. */
  | { state: 'unavailable' };

/**
 * Where to actually play a recording from.
 *
 * A local file if this is the phone that recorded it — instant, works with no
 * signal, and costs nothing to serve. Otherwise a signed URL, minted now and
 * never stored: a saved one is a bearer token for a video of someone's worst
 * week, and it would keep working after they signed out.
 *
 * The order is deliberate. Preferring the bucket would mean a phone streaming
 * back a file already sitting on its own disk, over mobile data, at a cost the
 * user pays twice.
 */
export function useMediaSource(
  localUri: string | undefined,
  remotePath: string | undefined,
): MediaSource {
  // Synchronous and cheap, so it is derived rather than put through state —
  // the local case then needs no effect and no render showing "resolving"
  // for a file that was on disk all along.
  const local = useMemo(
    () => (localUri !== undefined && recordingExists(localUri) ? localUri : null),
    [localUri],
  );

  /** undefined: not asked yet. null: asked, and there is nothing to play. */
  const [signed, setSigned] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (local !== null || remotePath === undefined) return;

    let cancelled = false;
    void signedUrlFor(remotePath).then((url) => {
      if (!cancelled) setSigned(url);
    });

    return () => {
      cancelled = true;
    };
  }, [local, remotePath]);

  if (local !== null) return { state: 'ready', uri: local, local: true };
  if (remotePath === undefined) return { state: 'unavailable' };
  if (signed === undefined) return { state: 'resolving' };
  if (signed === null) return { state: 'unavailable' };

  return { state: 'ready', uri: signed, local: false };
}
