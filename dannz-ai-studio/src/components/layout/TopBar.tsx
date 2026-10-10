import { useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Icon } from '../ui/Icon';
import { AuthModal } from '../auth/AuthModal';
import { SettingsModal } from '../settings/SettingsModal';
import { ExportModal } from '../export/ExportModal';

const VIEWS = [
  { id: 'single', labelKey: 'nav.single', icon: 'image' },
  { id: 'batch', labelKey: 'nav.batch', icon: 'layers' },
  { id: 'workspace', labelKey: 'nav.workspace', icon: 'edit' },
] as const;

export function TopBar() {
  const { viewMode, setViewMode, files, results, apiOnline, checkApi, cancelProcessing, isProcessing } =
    useStudio();
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <header className="relative z-30 flex h-14 items-center gap-3 border-b border-bg-border bg-bg-secondary/80 px-3 backdrop-blur-md">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <div className="leading-none">
          <p className="font-display text-[15px] font-extrabold uppercase tracking-[0.08em] text-text-primary">
            {t('app.name')}
          </p>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-text-muted">
            {t('app.tagline')}
          </p>
        </div>
      </div>

      <div className="mx-1 hidden h-8 w-px bg-bg-border sm:block" />

      {/* View switcher */}
      <nav className="flex items-center gap-1 rounded-lg bg-bg-primary p-1" aria-label={t('nav.menu')}>
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setViewMode(view.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              viewMode === view.id
                ? 'bg-accent-primary text-white shadow-glow-sm'
                : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
            }`}
            aria-current={viewMode === view.id}
          >
            <Icon name={view.icon} size={13} />
            <span className="hidden sm:inline">{t(view.labelKey)}</span>
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* API status */}
      <button
        type="button"
        onClick={checkApi}
        className="hidden items-center gap-2 rounded-md border border-bg-border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary transition-colors hover:border-accent-primary/50 hover:text-text-primary md:flex"
        title={t('ai.apiHint')}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            apiOnline === null
              ? 'bg-text-muted'
              : apiOnline
                ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,.8)]'
                : 'bg-error'
          }`}
        />
        {t('status.api')}: {apiOnline === null ? '—' : apiOnline ? t('ai.apiOnline') : t('ai.apiOffline')}
      </button>

      {/* Language */}
      <button
        type="button"
        onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
        className="toolbar-btn font-mono text-[11px] font-semibold uppercase"
        aria-label={t('nav.language')}
        title={t('nav.language')}
      >
        {lang === 'en' ? 'EN' : 'VI'}
      </button>

      {/* Theme */}
      <button
        type="button"
        onClick={toggleTheme}
        className="toolbar-btn"
        aria-label={t(theme === 'dark' ? 'nav.theme.light' : 'nav.theme.dark')}
        title={t(theme === 'dark' ? 'nav.theme.light' : 'nav.theme.dark')}
      >
        <Icon name={theme === 'dark' ? 'star' : 'palette'} size={16} />
      </button>

      {/* Export */}
      <button
        type="button"
        onClick={() => setExportOpen(true)}
        disabled={!results.length}
        className="toolbar-btn disabled:opacity-40"
        aria-label={t('top.export')}
        title={t('top.export')}
      >
        <Icon name="download" size={16} />
      </button>

      {/* Account */}
      <button
        type="button"
        onClick={() => (user ? setSettingsOpen(true) : setAuthOpen(true))}
        className="flex items-center gap-2 rounded-md border border-bg-border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-accent-primary/50 hover:text-text-primary"
      >
        <Icon name="shield" size={14} />
        <span className="hidden lg:inline">{user ? user.name : t('nav.login')}</span>
      </button>

      {isProcessing && (
        <button type="button" onClick={cancelProcessing} className="btn-danger !px-3 !py-1.5 text-xs">
          {t('process.cancel')}
        </button>
      )}

      {files.length > 0 && !isProcessing && (
        <span className="hidden font-mono text-[10px] uppercase tracking-wider text-text-muted xl:inline">
          {t('status.images', { count: files.length })}
        </span>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuth={() => setAuthOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} onLogout={logout} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </header>
  );
}