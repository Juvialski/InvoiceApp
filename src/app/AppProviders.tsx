import React, { useMemo, type ReactNode } from "react";
import { CompanyAccessProvider, useCompanyAccess } from "../context/CompanyAccessContext.tsx";
import { AssistantProvider, type AssistantProviderProps } from "../assistant/AssistantProvider.tsx";
import { EngoryxThemeProvider } from "../ui/EngoryxThemeProvider.tsx";
import { isSupabaseConfigured } from "../lib/supabase.ts";

export interface AppProvidersProps {
  children: ReactNode;
  assistantProps?: Partial<AssistantProviderProps>;
  enableAssistant?: boolean;
}

interface AssistantProviderBridgeProps {
  children: ReactNode;
  assistantProps?: Partial<AssistantProviderProps>;
}

function AssistantProviderBridge({ children, assistantProps }: AssistantProviderBridgeProps) {
  const { session, guestMode, activeCompanyId, permissions, activeCompany } = useCompanyAccess();

  const mergedAssistantProps: AssistantProviderProps = useMemo(() => {
    return {
      currentCompanyId: assistantProps?.currentCompanyId !== undefined ? assistantProps.currentCompanyId : activeCompanyId,
      currentCompanyGeneration: assistantProps?.currentCompanyGeneration ?? 0,
      isAuthenticated: assistantProps?.isAuthenticated !== undefined ? assistantProps.isAuthenticated : Boolean(isSupabaseConfigured && session),
      guestMode: assistantProps?.guestMode !== undefined ? assistantProps.guestMode : guestMode,
      permissions: assistantProps?.permissions !== undefined ? assistantProps.permissions : permissions,
      compactContext: assistantProps?.compactContext ?? {
        companyName: activeCompany?.name,
        currency: activeCompany?.defaultCurrency,
      },
      ...assistantProps,
      children,
    };
  }, [assistantProps, activeCompanyId, session, guestMode, permissions, activeCompany, children]);

  return <AssistantProvider {...mergedAssistantProps}>{children}</AssistantProvider>;
}

export const AppProviders: React.FC<AppProvidersProps> = ({
  children,
  assistantProps,
  enableAssistant = true,
}) => {
  return (
    <EngoryxThemeProvider>
      <CompanyAccessProvider>
        {enableAssistant ? (
          <AssistantProviderBridge assistantProps={assistantProps}>
            {children}
          </AssistantProviderBridge>
        ) : (
          children
        )}
      </CompanyAccessProvider>
    </EngoryxThemeProvider>
  );
};

export default AppProviders;

