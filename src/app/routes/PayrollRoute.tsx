import React from "react";
import { PayrollPageV2, type PayrollPageV2Props } from "../../components/payroll/PayrollPageV2";

export type PayrollRouteProps = PayrollPageV2Props;

export const PayrollRoute: React.FC<PayrollRouteProps> = (props) => {
  return <PayrollPageV2 {...props} />;
};

export default PayrollRoute;
