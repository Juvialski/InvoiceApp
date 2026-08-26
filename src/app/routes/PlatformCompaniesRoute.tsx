import React from "react";
import { CompanyManagement, type CompanyManagementProps } from "../../components/access/CompanyManagement.tsx";

export interface PlatformCompaniesRouteProps extends CompanyManagementProps {
  onClose?: () => void;
  showBackButton?: boolean;
}

export const PlatformCompaniesRoute: React.FC<PlatformCompaniesRouteProps> = (props) => {
  const { onClose, showBackButton = true, ...managementProps } = props;
  return (
    <div>
      {showBackButton && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          Back to workspace
        </button>
      )}
      <CompanyManagement {...managementProps} companies={props.companies} onClose={onClose} />
    </div>
  );
};

export default PlatformCompaniesRoute;
