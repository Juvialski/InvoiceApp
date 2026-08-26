import React from "react";
import { Settings as SettingsScreen } from "../../components/Settings";
import type { RegionalSettings } from "../../config/regional";

export interface SettingsRouteProps {
  settings: RegionalSettings;
  onChange: (settings: RegionalSettings) => void;
}

export const SettingsRoute: React.FC<SettingsRouteProps> = ({ settings, onChange }) => {
  return <SettingsScreen settings={settings} onChange={onChange} />;
};

export default SettingsRoute;
