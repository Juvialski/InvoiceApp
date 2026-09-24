import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { CompanyAccessProvider } from './context/CompanyAccessContext.tsx';
import { BRAND } from './config/brand.ts';
import { currentDeploymentIdentity } from './lib/deploymentIdentity.ts';
import { applyDeploymentSearchPolicy } from './lib/deploymentSearchPolicy.ts';
import { HydroqualisenseThemeProvider } from './ui/HydroqualisenseThemeProvider.tsx';
import { applicationModeForPath, isCanonicalHydroqualisenseHost } from './app/applicationMode.ts';
import './index.css';

const deploymentIdentity = currentDeploymentIdentity();
applyDeploymentSearchPolicy(document, deploymentIdentity.environment, isCanonicalHydroqualisenseHost(window.location.hostname));

const ProductionApp = lazy(() => import('./App.tsx'));
const PublicFunnelRoot = lazy(() => import('./public/PublicFunnelRoot.tsx'));
const DemoRoot = lazy(() => import('./demo/DemoRoot.tsx'));
const WorkflowMapRoot = lazy(() => import('./workflow-map/WorkflowMapRoot.tsx'));

function Root() {
  const mode = applicationModeForPath(window.location.pathname, window.location.search, window.location.hash, undefined, window.location.hostname);
  return (
    <HydroqualisenseThemeProvider>
      <Suspense fallback={<div className="hqs-app-canvas hqs-primary-text flex min-h-screen items-center justify-center text-sm font-semibold">Loading {BRAND.productName}…</div>}>
        {mode === 'workflow-map' ? (
          <WorkflowMapRoot />
        ) : mode === 'demo' ? (
          <DemoRoot />
        ) : mode === 'public' ? (
          <PublicFunnelRoot />
        ) : (
          <CompanyAccessProvider>
            <ProductionApp />
          </CompanyAccessProvider>
        )}
      </Suspense>
    </HydroqualisenseThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
