import React from "react";
import { Settings as SettingsScreen } from "../../components/Settings";
import type { RegionalSettings } from "../../config/regional";

export interface SettingsRouteProps {
  settings: RegionalSettings;
  onChange: (settings: RegionalSettings) => void;
  showDeploymentAccessManagement?: boolean;
}

export const SettingsRoute: React.FC<SettingsRouteProps> = ({ settings, onChange, showDeploymentAccessManagement }) => {
  return <SettingsScreen settings={settings} onChange={onChange} showDeploymentAccessManagement={showDeploymentAccessManagement} />;
};

export default SettingsRoute;
