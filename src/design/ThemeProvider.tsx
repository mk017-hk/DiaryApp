import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { themes, type ColorSchemeName, type Theme } from './theme';

/** What the user chose in Settings. `system` follows the device. */
export type ThemePreference = ColorSchemeName | 'system';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Persisted preference, once Settings exists. Until then the provider simply
   * follows the device, which is the correct default anyway.
   */
  initialPreference?: ThemePreference;
}

export function ThemeProvider({ children, initialPreference = 'system' }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved: ColorSchemeName =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

    return { theme: themes[resolved], preference, setPreference };
  }, [preference, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used inside a <ThemeProvider>.');
  }
  return context;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}

export function useThemePreference() {
  const { preference, setPreference } = useThemeContext();
  return { preference, setPreference };
}

/**
 * Builds themed styles once per theme rather than on every render.
 *
 * Define the factory at module scope so the memo actually holds — an inline
 * arrow is a new function each render, which is still correct but recomputes:
 *
 *   const makeStyles = (t: Theme) => ({ root: { backgroundColor: t.colors.canvas } });
 *   // inside the component:
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
