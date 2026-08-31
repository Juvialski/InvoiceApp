import React from "react";
import { CashBankingPage, type CashBankingPageProps } from "../../components/CashBankingPage.tsx";
import { CashSettlementAllocationWorkspace } from "../../components/CashSettlementAllocationWorkspace.tsx";
import { ConnectedStatementReview } from "../../components/ConnectedStatementReview.tsx";

export type CashBankingRouteProps = CashBankingPageProps;

export const CashBankingRoute: React.FC<CashBankingRouteProps> = (props) => {
  return <div className="space-y-5">
    <ConnectedStatementReview
      data={props.data}
      canImport={props.canImport}
      onCommitImport={props.onCommitImport}
    />
    <CashSettlementAllocationWorkspace
      data={props.data}
      selectedTransactionId={props.selectedTransactionId}
      onNavigatePath={props.onNavigatePath}
      candidates={props.reconciliationCandidates || []}
      canReconcile={props.canReconcile}
      canSettleTarget={props.canSettleTarget}
      onSaveMatch={props.onSaveMatch}
      onSaveMatchBatch={props.onSaveMatchBatch}
      onReverseMatch={props.onReverseMatch}
      canReverseMatch={props.canReverseMatch}
    />
    <CashBankingPage {...props} />
  </div>;
};

export default CashBankingRoute;
