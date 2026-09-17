import React, { type ComponentProps, type ReactNode } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { hydroqualisenseTheme } from "./hydroqualisense";

type AstryxThemeMode = NonNullable<ComponentProps<typeof Theme>["mode"]>;

export interface HydroqualisenseThemeProviderProps {
  children: ReactNode;
  mode?: AstryxThemeMode;
}

export function HydroqualisenseThemeProvider({
  children,
  mode = "light",
}: HydroqualisenseThemeProviderProps): React.JSX.Element {
  return (
    <Theme theme={hydroqualisenseTheme} mode={mode}>
      {children}
    </Theme>
  );
}

export default HydroqualisenseThemeProvider;
