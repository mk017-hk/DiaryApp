import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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

/** Belongs to the phone, not the account: see DEVICE_KEYS in the wipe. */
const PREFERENCE_KEY = 'theme.preference.v1';

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

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
  const [preference, setStoredPreference] = useState<ThemePreference>(initialPreference);
  const chosen = useRef(false);

  // Read once. A choice made before the read lands wins over it.
  useEffect(() => {
    void AsyncStorage.getItem(PREFERENCE_KEY)
      .then((stored) => {
        if (!chosen.current && isPreference(stored)) setStoredPreference(stored);
      })
      .catch(() => undefined);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    chosen.current = true;
    setStoredPreference(next);
    void AsyncStorage.setItem(PREFERENCE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved: ColorSchemeName =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

    return { theme: themes[resolved], preference, setPreference };
  }, [preference, systemScheme, setPreference]);

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
