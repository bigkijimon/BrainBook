import { Component, StrictMode, Suspense, lazy, type ReactNode } from 'react';
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
import './theme-palette.mjs';
import './styles.css';
import './neon-navigation.css';

// /vr (Office in 3D and WebXR) loads on its own, so the main page does not carry it.
const OfficeVR = lazy(() => import('./OfficeVR'));

if (['/terminal', '/pair', '/vr'].includes(window.location.pathname)) document.getElementById('bb-boot')?.remove();

// A render error used to leave a blank page (an API answering with an unexpected shape was enough).
// This keeps the app's look, says what happened, and offers the one thing that helps: reload.
class CrashGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    document.getElementById('bb-boot')?.remove();
    return <main className="crash-guard" role="alert">
      <h1>BrainBook hit a snag</h1>
      <p>The screen could not be drawn. Your tasks and notes are untouched.</p>
      <code>{this.state.error.message}</code>
      <button type="button" onClick={() => window.location.reload()}>Reload</button>
    </main>;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><CrashGuard>
    {window.location.pathname === '/terminal' ? <HermesTerminal /> : window.location.pathname === '/pair' ? <PairPage /> : window.location.pathname === '/vr' ? <Suspense fallback={null}><OfficeVR /></Suspense> : <App />}
  </CrashGuard></StrictMode>,
);
