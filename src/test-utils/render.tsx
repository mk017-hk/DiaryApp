import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider, type ThemePreference } from '@/design';

const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

interface Options extends Omit<RenderOptions, 'wrapper'> {
  theme?: ThemePreference;
}

/**
 * Renders a component inside the same providers the real app uses, so tests
 * exercise themed output rather than a bare tree.
 *
 * Async because React Native Testing Library v14 renders concurrently under
 * React 19 — `render` and `fireEvent` both return promises and must be awaited,
 * or queries run against an empty tree.
 */
export async function renderWithProviders(
  ui: ReactElement,
  { theme = 'light', ...options }: Options = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider initialPreference={theme}>{children}</ThemeProvider>
      </SafeAreaProvider>
    );
  }

  return await render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react-native';
