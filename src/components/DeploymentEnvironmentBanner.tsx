import React from "react";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { currentDeploymentIdentity } from "../lib/deploymentIdentity.ts";

export function DeploymentEnvironmentBanner() {
  const identity = currentDeploymentIdentity();
  if (identity.environment === "production") return null;

  const unresolved = identity.environment === "unknown";
  const label = unresolved
    ? "DEPLOYMENT IDENTITY UNRESOLVED · DO NOT USE FOR PRODUCTION"
    : identity.isQa
      ? "QA ENVIRONMENT · SYNTHETIC DATA ONLY"
      : `${identity.environment.toUpperCase()} ENVIRONMENT`;
  const Icon = unresolved ? AlertTriangle : FlaskConical;

  return (
    <div
      role="status"
      data-deployment-environment={identity.environment}
      className={`flex items-center justify-center gap-2 px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.14em] ${unresolved ? "bg-rose-700 text-white" : "bg-amber-400 text-amber-950"}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
      {identity.deploymentId && <span className="rounded bg-black/10 px-1.5 py-0.5 normal-case tracking-normal">{identity.deploymentId}</span>}
    </div>
  );
}

export default DeploymentEnvironmentBanner;
