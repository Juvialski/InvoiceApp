import React from "react";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

export interface HelpRouteProps {
  readonly search: string;
  readonly onNavigatePath?: AppNavigate;
}

export const HelpRoute: React.FC<HelpRouteProps> = ({ search }) => (
  <section data-help-route="true" aria-label="Help Center" className="space-y-5">
    <h1 className="text-2xl font-black text-slate-950">Help Center</h1>
    <p className="text-sm text-slate-600">Help content is loading for {search || "the workspace"}.</p>
  </section>
);

export default HelpRoute;
