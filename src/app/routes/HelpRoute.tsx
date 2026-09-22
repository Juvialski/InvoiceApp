import React from "react";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import { HelpCenterPage } from "../../components/help/HelpCenterPage.tsx";

export interface HelpRouteProps {
  readonly search: string;
  readonly onNavigatePath?: AppNavigate;
}

export const HelpRoute: React.FC<HelpRouteProps> = ({ search, onNavigatePath }) => <HelpCenterPage search={search} onNavigatePath={onNavigatePath} />;

export default HelpRoute;
