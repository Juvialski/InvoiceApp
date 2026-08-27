import React, { type ComponentProps, type ReactNode } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { engoryxTheme } from "./engoryx";

type AstryxThemeMode = NonNullable<ComponentProps<typeof Theme>["mode"]>;

export interface EngoryxThemeProviderProps {
  children: ReactNode;
  mode?: AstryxThemeMode;
}

export function EngoryxThemeProvider({
  children,
  mode = "light",
}: EngoryxThemeProviderProps): React.JSX.Element {
  return (
    <Theme theme={engoryxTheme} mode={mode}>
      {children}
    </Theme>
  );
}

export default EngoryxThemeProvider;


