import React from "react";
import { CashBankingPage, type CashBankingPageProps } from "../../components/CashBankingPage.tsx";
import { CashSettlementAllocationWorkspace } from "../../components/CashSettlementAllocationWorkspace.tsx";
import { ConnectedStatementReview } from "../../components/ConnectedStatementReview.tsx";

export type CashBankingRouteProps = CashBankingPageProps;

export const CashBankingRoute: React.FC<CashBankingRouteProps> = (props) => {
  return <div className="space-y-5">
    <CashBankingPage {...props} />
    <ConnectedStatementReview
      data={props.data}
      canImport={props.canImport}
      onCommitImport={props.onCommitImport}
    />
    <CashSettlementAllocationWorkspace
      data={props.data}
      selectedTransactionId={props.selectedTransactionId}
      targetContext={props.targetContext}
      onNavigatePath={props.onNavigatePath}
      candidates={props.reconciliationCandidates || []}
      canReconcile={props.canReconcile}
      canSettleTarget={props.canSettleTarget}
      onSaveMatch={props.onSaveMatch}
      onSaveMatchBatch={props.onSaveMatchBatch}
      onReverseMatch={props.onReverseMatch}
      canReverseMatch={props.canReverseMatch}
    />
  </div>;
};

export default CashBankingRoute;
