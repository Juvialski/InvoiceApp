import React from "react";
import { CashBankingPage, type CashBankingPageProps } from "../../components/CashBankingPage.tsx";
import { CashSettlementAllocationWorkspace } from "../../components/CashSettlementAllocationWorkspace.tsx";

export type CashBankingRouteProps = CashBankingPageProps;

export const CashBankingRoute: React.FC<CashBankingRouteProps> = (props) => {
  return <div className="space-y-5">
    <CashSettlementAllocationWorkspace
      data={props.data}
      candidates={props.reconciliationCandidates || []}
      canReconcile={props.canReconcile}
      onSaveMatch={props.onSaveMatch}
      onSaveMatchBatch={props.onSaveMatchBatch}
      onReverseMatch={props.onReverseMatch}
      canReverseMatch={props.canReverseMatch}
    />
    <CashBankingPage {...props} />
  </div>;
};

export default CashBankingRoute;
