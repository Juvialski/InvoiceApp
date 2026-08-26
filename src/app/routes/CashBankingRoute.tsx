import React from "react";
import { CashBankingPage, type CashBankingPageProps } from "../../components/CashBankingPage.tsx";

export type CashBankingRouteProps = CashBankingPageProps;

export const CashBankingRoute: React.FC<CashBankingRouteProps> = (props) => {
  return <CashBankingPage {...props} />;
};

export default CashBankingRoute;
