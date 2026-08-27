import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { CompanyAccessProvider } from './context/CompanyAccessContext.tsx';
import { EngoryxThemeProvider } from './ui/EngoryxThemeProvider.tsx';
import { applicationModeForPath } from './app/applicationMode.ts';
import './index.css';

const ProductionApp = lazy(() => import('./App.tsx'));
const DemoRoot = lazy(() => import('./demo/DemoRoot.tsx'));

function Root() {
  const mode = applicationModeForPath(window.location.pathname);
  return (
    <EngoryxThemeProvider>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-600">Loading Engoryx…</div>}>
        {mode === 'demo' ? (
          <DemoRoot />
        ) : (
          <CompanyAccessProvider>
            <ProductionApp />
          </CompanyAccessProvider>
        )}
      </Suspense>
    </EngoryxThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
