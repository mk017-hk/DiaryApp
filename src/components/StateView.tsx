import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState, type EmptyStateProps } from './EmptyState';
import { ErrorState, type ErrorStateProps } from './ErrorState';
import { Skeleton } from './Skeleton';

export type LoadStatus = 'loading' | 'error' | 'success';

export interface StateViewProps<T> {
  status: LoadStatus;
  data: T | undefined;
  /** Decides whether successful data should render as empty. */
  isEmpty?: (data: T) => boolean;
  empty: EmptyStateProps;
  error?: Omit<ErrorStateProps, 'testID'>;
  /** Custom loading UI. Defaults to a small stack of skeleton lines. */
  loading?: ReactNode;
  children: (data: T) => ReactNode;
}

/**
 * Makes the four states structural rather than optional.
 *
 * Every data-backed surface renders through this, so "loading", "empty" and
 * "error" cannot be forgotten the way they are when each screen hand-rolls its
 * own conditionals. A blank screen on failure is a bug this component exists to
 * prevent.
 */
export function StateView<T>({
  status,
  data,
  isEmpty,
  empty,
  error,
  loading,
  children,
}: StateViewProps<T>): ReactElement {
  if (status === 'loading') {
    return <>{loading ?? <DefaultLoading />}</>;
  }

  if (status === 'error') {
    return <ErrorState {...error} />;
  }

  if (data === undefined || (isEmpty?.(data) ?? false)) {
    return <EmptyState {...empty} />;
  }

  return <>{children(data)}</>;
}

function DefaultLoading() {
  return (
    <View style={styles.loading} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Skeleton width="45%" height={12} />
      <Skeleton width="100%" height={18} />
      <Skeleton width="80%" height={18} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { gap: 12, paddingVertical: 16 },
});
