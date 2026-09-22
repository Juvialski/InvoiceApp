import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Theme } from "@astryxdesign/core/theme";
import { hydroqualisenseTheme } from "./hydroqualisense";
import {
  applyThemePreference,
  normalizeThemePreference,
  readThemePreference,
  writeThemePreference,
  type ThemePreference,
} from "./themePreference.ts";

export interface HydroqualisenseThemeProviderProps {
  children: ReactNode;
  mode?: ThemePreference;
}

export interface ThemePreferenceContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function useThemePreference(): ThemePreferenceContextValue {
  const context = useContext(ThemePreferenceContext);
  if (!context) throw new Error("useThemePreference must be used within HydroqualisenseThemeProvider");
  return context;
}

export function HydroqualisenseThemeProvider({
  children,
  mode,
}: HydroqualisenseThemeProviderProps): React.JSX.Element {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => normalizeThemePreference(mode ?? readThemePreference()));
  const setPreference = useCallback((nextPreference: ThemePreference) => {
    const normalized = normalizeThemePreference(nextPreference);
    writeThemePreference(normalized);
    applyThemePreference(normalized);
    setPreferenceState(normalized);
  }, []);
  const contextValue = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  useLayoutEffect(() => {
    applyThemePreference(preference);
  }, [preference]);

  return (
    <ThemePreferenceContext.Provider value={contextValue}>
      <Theme theme={hydroqualisenseTheme} mode={preference}>
        {children}
      </Theme>
    </ThemePreferenceContext.Provider>
  );
}

export default HydroqualisenseThemeProvider;
