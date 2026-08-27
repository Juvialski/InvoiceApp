import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { CompanyAccessProvider } from "./context/CompanyAccessContext.tsx";
import { EngoryxThemeProvider } from "./ui/EngoryxThemeProvider.tsx";
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EngoryxThemeProvider>
      <CompanyAccessProvider>
        <App />
      </CompanyAccessProvider>
    </EngoryxThemeProvider>
  </StrictMode>,
);

