import { useRef, useState } from 'react';
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
  const { viewMode, setViewMode, files, results, apiOnline, checkApi, cancelProcessing, isProcessing, clearFiles, addFiles } =
    useStudio();
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  /** Logo = home: drop back to the empty landing state. */
  const goHome = () => {
    clearFiles();
    setViewMode('single');
  };

  return (
    <header className="relative z-30 flex h-14 items-center gap-1 overflow-x-auto border-b border-bg-border/40 bg-bg-secondary/45 px-2.5 backdrop-blur-md sm:gap-2 sm:px-3">
      {/* Brand (click = home) */}
      <button
        type="button"
        onClick={goHome}
        className="topnav-btn flex-shrink-0 items-center gap-2 rounded-xl px-1.5 py-1 text-left text-text-secondary transition-all duration-200 ease-out hover:bg-bg-tertiary hover:text-text-primary"
        aria-label={t('nav.home')}
        title={t('nav.home')}
      >
        <span className="topnav-home-icon-only inline-flex h-8 w-8 shrink-0 items-center justify-center">
          <img src="/favicon.svg" alt="" className="h-8 w-8 drop-shadow-[0_0_8px_rgba(0,0,0,0.3)]" onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = '/favicon.ico'; }} />
        </span>
        <span className="topnav-home-text text-left leading-none">
          <span className="block font-display text-[15px] font-extrabold uppercase tracking-[0.08em] text-text-primary sm:text-[14px]">
            {t('app.name')}
          </span>
          <span className="mt-0.5 hidden font-mono text-[9px] uppercase tracking-[0.22em] text-text-muted lg:inline">
            {t('app.tagline')}
          </span>
        </span>
      </button>

      <div className="mx-1 hidden h-8 w-px bg-bg-border sm:block" />

      {/* View switcher */}
      <nav className="topnav-btn flex-shrink-0 flex items-center gap-1 rounded-xl bg-bg-primary/60 p-1 backdrop-blur-md" aria-label={t('nav.menu')}>
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setViewMode(view.id)}
            className={`topnav-btn flex-shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold sm:px-2.5 uppercase tracking-wider transition-all duration-200 ease-out ${
              viewMode === view.id
                ? 'bg-accent-primary text-white shadow-glow animate-glow'
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
        className="topnav-btn hidden shrink-0 items-center gap-2 rounded-xl border border-bg-border/50 bg-bg-primary/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary transition-all duration-200 ease-out hover:border-accent-primary/50 hover:bg-bg-tertiary hover:text-text-primary md:flex"
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
        className="topnav-btn toolbar-btn font-mono text-[11px] font-semibold uppercase"
        aria-label={t('nav.language')}
        title={t('nav.language')}
      >
        {lang === 'en' ? 'EN' : 'VI'}
      </button>

      {/* Theme: show the mode you would switch TO. */}
      <button
        type="button"
        onClick={toggleTheme}
        className="topnav-btn toolbar-btn"
        aria-label={t(theme === 'dark' ? 'nav.theme.light' : 'nav.theme.dark')}
        title={t(theme === 'dark' ? 'nav.theme.light' : 'nav.theme.dark')}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>

      {/* Export */}
      <button
        type="button"
        onClick={() => setExportOpen(true)}
        disabled={!results.length}
        className="topnav-btn toolbar-btn disabled:opacity-40"
        aria-label={t('top.export')}
        title={t('top.export')}
      >
        <Icon name="download" size={16} />
      </button>

      {/* Account */}
      <button
        type="button"
        onClick={() => (user ? setSettingsOpen(true) : setAuthOpen(true))}
        className="topnav-btn flex-shrink-0 items-center gap-2 rounded-xl border border-bg-border/50 bg-bg-primary/40 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-all duration-200 ease-out hover:border-accent-primary/50 hover:bg-bg-tertiary hover:text-text-primary"
      >
        <Icon name="shield" size={14} />
        <span className="hidden lg:inline">{user ? user.name : t('nav.login')}</span>
      </button>

      {/* Add image - available in EVERY view, not just the empty state.
          Without this the only way to load a second file is to click Home. */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="topnav-btn btn-secondary !px-2.5 !py-1.5 text-xs"
        aria-label={t('top.newFile')}
        title={t('top.newFile')}
      >
        <Icon name="plus" size={14} />
        <span className="hidden lg:inline">{t('top.newFile')}</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff"
        multiple
        className="file-input-offscreen"
        aria-label={t('top.newFile')}
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(Array.from(e.target.files), true);
          window.setTimeout(() => {
            if (fileInputRef.current) fileInputRef.current.value = '';
          }, 0);
        }}
      />

      {isProcessing && (
        <button type="button" onClick={cancelProcessing} className="topnav-btn btn-danger !px-3 !py-1.5 text-xs">
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