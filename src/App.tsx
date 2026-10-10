import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { StudioProvider } from './contexts/StudioContext';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { Toasts } from './components/ui/Toasts';
import { registerServiceWorker } from './utils/registerSW';

/**
 * Root component. The document shell (<html>/<head>/<body>) lives in index.html;
 * App mounts the full-viewport studio shell. Terminal-level overlays that must
 * survive view switches (toasts, processing) render here, while modal dialogs
 * are owned by the TopBar that triggers them.
 */
export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <StudioProvider>
            <AppShell />
            <Toasts />
          </StudioProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

// Register the PWA service worker after the app is interactive.
registerServiceWorker();
