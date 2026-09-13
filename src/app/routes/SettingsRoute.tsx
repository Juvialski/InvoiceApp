import React from "react";
import { Settings as SettingsScreen } from "../../components/Settings";
import type { RegionalSettings } from "../../config/regional";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

export interface SettingsRouteProps {
  settings: RegionalSettings;
  onChange: (settings: RegionalSettings) => void;
  showDeploymentAccessManagement?: boolean;
  onNavigatePath?: AppNavigate;
}

export const SettingsRoute: React.FC<SettingsRouteProps> = ({ settings, onChange, showDeploymentAccessManagement, onNavigatePath }) => {
  return <SettingsScreen settings={settings} onChange={onChange} showDeploymentAccessManagement={showDeploymentAccessManagement} onNavigatePath={onNavigatePath} />;
};

export default SettingsRoute;
