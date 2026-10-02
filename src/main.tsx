import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import HermesTerminal from './HermesTerminal';
import PairPage from './PairPage';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/bungee/400.css';
import '@fontsource/yellowtail/400.css';
import '@fontsource/vt323/400.css';
import './styles.css';

// /vr (Office in 3D and WebXR) loads on its own, so the main page does not carry it.
const OfficeVR = lazy(() => import('./OfficeVR'));

if (['/terminal', '/pair', '/vr'].includes(window.location.pathname)) document.getElementById('bb-boot')?.remove();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/terminal' ? <HermesTerminal /> : window.location.pathname === '/pair' ? <PairPage /> : window.location.pathname === '/vr' ? <Suspense fallback={null}><OfficeVR /></Suspense> : <App />}
  </StrictMode>,
);
