import type { Session } from '@supabase/supabase-js';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SessionProvider, useSession } from '../SessionProvider';

/**
 * The order things happen in when somebody signs in.
 *
 * The session provider is what tells the rest of the app that a person is
 * signed in — and the moment it does, the sync engine starts and the root gate
 * navigates to Today. So "is this phone ready for them" has to be answered
 * *before* that, not by something reacting to it. These pin down that it is.
 */

type Listener = (session: Session | null) => void;
let emit: Listener = () => undefined;

jest.mock('@/services/supabase/client', () => ({ isSupabaseConfigured: true }));
jest.mock('@/services/supabase/auth', () => ({
  getSession: () => Promise.resolve(null),
  observeSession: (listener: Listener) => {
    emit = listener;
    return () => undefined;
  },
}));

const sessionFor = (id: string): Session =>
  ({
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id, user_metadata: {}, app_metadata: {}, aud: 'authenticated', created_at: '' },
  }) as unknown as Session;

function Status() {
  const { status, user } = useSession();
  return <Text testID="status">{`${status}:${user?.id ?? 'nobody'}`}</Text>;
}

/** A preparation that waits until the test says it may finish. */
const controllable = () => {
  let finish: (ready: boolean) => void = () => undefined;
  const prepare = jest.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  return { prepare, finish: (ready: boolean) => finish(ready) };
};

const shown = () => screen.getByTestId('status').props.children as string;

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('signing in', () => {
  it('does not report anyone as signed in while the phone is being prepared', async () => {
    const { prepare, finish } = controllable();
    await render(
      <SessionProvider prepareDevice={prepare}>
        <Status />
      </SessionProvider>,
    );
    await settle();

    await act(async () => {
      emit(sessionFor('bob'));
    });
    await settle();

    // The window in which a sync pass would otherwise be uploading somebody
    // else's unsent entries as his.
    expect(shown()).toEqual('signed-out:nobody');

    await act(async () => finish(true));
    expect(shown()).toEqual('signed-in:bob');
  });

  it('asks the phone to be prepared for exactly the account signing in', async () => {
    const { prepare, finish } = controllable();
    await render(
      <SessionProvider prepareDevice={prepare}>
        <Status />
      </SessionProvider>,
    );
    await settle();

    await act(async () => {
      emit(sessionFor('bob'));
    });
    await act(async () => finish(true));

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: 'bob' }) }),
    );
  });

  // Fails closed: neither shown nor treated as signed in, so the sync engine
  // never starts for an account whose device could not be settled.
  it('blocks rather than letting a session through that could not be prepared', async () => {
    const { prepare, finish } = controllable();
    await render(
      <SessionProvider prepareDevice={prepare}>
        <Status />
      </SessionProvider>,
    );
    await settle();

    await act(async () => {
      emit(sessionFor('bob'));
    });
    await act(async () => finish(false));

    expect(shown()).toEqual('blocked:nobody');
  });

  // Preparing can involve a wipe, which takes time. A sign-out landing in the
  // middle must not be overwritten by the sign-in that started before it.
  it('lets a sign-out that arrives mid-preparation win', async () => {
    const { prepare, finish } = controllable();
    await render(
      <SessionProvider prepareDevice={prepare}>
        <Status />
      </SessionProvider>,
    );
    await settle();

    await act(async () => {
      emit(sessionFor('bob'));
    });
    await settle();
    await act(async () => {
      emit(null);
    });
    await act(async () => finish(true));

    expect(shown()).toEqual('signed-out:nobody');
  });
});

describe('once signed in', () => {
  // The token refreshes about hourly and arrives through the same channel. It
  // must not cost a storage read, let alone a wipe check, every time.
  it('does not prepare again for a token refresh', async () => {
    const prepare = jest.fn(() => Promise.resolve(true));
    await render(
      <SessionProvider prepareDevice={prepare}>
        <Status />
      </SessionProvider>,
    );
    await settle();

    await act(async () => emit(sessionFor('bob')));
    await act(async () => emit(sessionFor('bob')));
    await act(async () => emit(sessionFor('bob')));

    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('prepares again after a sign-out, because the next person may be someone else', async () => {
    const prepare = jest.fn(() => Promise.resolve(true));
    await render(
      <SessionProvider prepareDevice={prepare}>
        <Status />
      </SessionProvider>,
    );
    await settle();

    await act(async () => emit(sessionFor('alice')));
    await act(async () => emit(null));
    await act(async () => emit(sessionFor('bob')));

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(shown()).toEqual('signed-in:bob');
  });
});
