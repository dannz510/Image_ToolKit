import re

filepath = r'D:\Do not open\Extract IMG\dannz-ai-studio\src\components\layout\TopBar.tsx'
f = open(filepath, 'r')
content = f.read()
f.close()

# 1. Update TopBar header to use mica/panel and add topnav-btn class + flex-wrap handling
old_header = '''     <header className="relative z-30 flex h-14 items-center gap-3 border-b border-bg-border bg-bg-secondary/80 px-3 backdrop-blur-md">'''

new_header = '''     <header className="relative z-30 flex h-14 items-center gap-2 overflow-x-auto border-b border-bg-border/40 bg-bg-secondary/45 px-3 backdrop-blur-md">'''

if old_header in content:
    content = content.replace(old_header, new_header)
    print("OK: header updated")
else:
    print("FAIL: header not found")

# 2. Update home button - add responsive text hiding, mica effect, topnav classes
old_home = '''      {/* Brand (click = home) */}
      <button
        type="button"
        onClick={goHome}
        className="flex items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-bg-tertiary"
        aria-label={t('nav.home')}
        title={t('nav.home')}
      >
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <span className="text-left leading-none">
          <span className="block font-display text-[15px] font-extrabold uppercase tracking-[0.08em] text-text-primary">
            {t('app.name')}
          </span>
          <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.22em] text-text-muted">
            {t('app.tagline')}
          </span>
        </span>
      </button>'''

new_home = '''      {/* Brand (click = home) */}
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
      </button>'''

if old_home in content:
    content = content.replace(old_home, new_home)
    print("OK: home button updated")
else:
    print("FAIL: home button not found")

# 3. Update view switcher nav - add glow hover for active, compact on mobile
old_nav = '''      {/* View switcher */}
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
      </nav>'''

new_nav = '''      {/* View switcher */}
      <nav className="topnav-btn flex-shrink-0 flex items-center gap-1 rounded-xl bg-bg-primary/60 p-1 backdrop-blur-md" aria-label={t('nav.menu')}>
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setViewMode(view.id)}
            className={`topnav-btn flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ease-out ${
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
      </nav>'''

if old_nav in content:
    content = content.replace(old_nav, new_nav)
    print("OK: view switcher updated")
else:
    print("FAIL: view switcher not found")

# 4. Update API status button - add topnav-btn class
old_api = '''      {/* API status */}
      <button
        type="button"
        onClick={checkApi}
        className="hidden items-center gap-2 rounded-md border border-bg-border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary transition-colors hover:border-accent-primary/50 hover:text-text-primary md:flex"
        title={t('ai.apiHint')}
      >'''

new_api = '''      {/* API status */}
      <button
        type="button"
        onClick={checkApi}
        className="topnav-btn hidden shrink-0 items-center gap-2 rounded-xl border border-bg-border/50 bg-bg-primary/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-secondary transition-all duration-200 ease-out hover:border-accent-primary/50 hover:bg-bg-tertiary hover:text-text-primary md:flex"
        title={t('ai.apiHint')}
      >'''

if old_api in content:
    content = content.replace(old_api, new_api)
    print("OK: api status updated")
else:
    print("FAIL: api status not found")

# 5. Update language button - add glow
old_lang = '''      {/* Language */}
      <button
        type="button"
        onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
        className="toolbar-btn font-mono text-[11px] font-semibold uppercase"
        aria-label={t('nav.language')}
        title={t('nav.language')}
      >
        {lang === 'en' ? 'EN' : 'VI'}
      </button>'''

new_lang = '''      {/* Language */}
      <button
        type="button"
        onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
        className="topnav-btn toolbar-btn font-mono text-[11px] font-semibold uppercase"
        aria-label={t('nav.language')}
        title={t('nav.language')}
      >
        {lang === 'en' ? 'EN' : 'VI'}
      </button>'''

if old_lang in content:
    content = content.replace(old_lang, new_lang)
    print("OK: language button updated")
else:
    print("FAIL: language button not found")

# 6. Update theme button
old_theme = '''      {/* Theme: show the mode you would switch TO. */}
      <button
        type="button"
        onClick={toggleTheme}
        className="toolbar-btn"
        aria-label={t(theme === 'dark' ? 'nav.theme.light' : 'nav.theme.dark')}
        title={t(theme === 'dark' ? 'nav.theme.light' : 'nav.theme.dark')}
      >'''

new_theme = '''      {/* Theme: show the mode you would switch TO. */}
      <button
        type="button"
        onClick={toggleTheme}
        className="topnav-btn toolbar-btn"
        aria-label={t(theme === 'dark' ? 'nav.theme.light' : 'nav.theme.dark')}
        title={t(theme === 'dark' ? 'nav.theme.light' : 'nav.theme.dark')}
      >'''

if old_theme in content:
    content = content.replace(old_theme, new_theme)
    print("OK: theme button updated")
else:
    print("FAIL: theme button not found")

# 7. Update export button
old_export = '''      {/* Export */}
      <button
        type="button"
        onClick={() => setExportOpen(true)}
        disabled={!results.length}
        className="toolbar-btn disabled:opacity-40"
        aria-label={t('top.export')}
        title={t('top.export')}
      >'''

new_export = '''      {/* Export */}
      <button
        type="button"
        onClick={() => setExportOpen(true)}
        disabled={!results.length}
        className="topnav-btn toolbar-btn disabled:opacity-40"
        aria-label={t('top.export')}
        title={t('top.export')}
      >'''

if old_export in content:
    content = content.replace(old_export, new_export)
    print("OK: export button updated")
else:
    print("FAIL: export button not found")

# 8. Update account button - enhance with glow hover
old_account = '''       {/* Account */}
       <button
         type="button"
         onClick={() => (user ? setSettingsOpen(true) : setAuthOpen(true))}
         className="flex items-center gap-2 rounded-md border border-bg-border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-colors hover:border-accent-primary/50 hover:text-text-primary"
       >'''

new_account = '''      {/* Account */}
      <button
        type="button"
        onClick={() => (user ? setSettingsOpen(true) : setAuthOpen(true))}
        className="topnav-btn flex-shrink-0 items-center gap-2 rounded-xl border border-bg-border/50 bg-bg-primary/40 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary transition-all duration-200 ease-out hover:border-accent-primary/50 hover:bg-bg-tertiary hover:text-text-primary"
      >'''

if old_account in content:
    content = content.replace(old_account, new_account)
    print("OK: account button updated")
else:
    print("FAIL: account button not found")

# 9. Update "Add image" button - add glow
old_add = '''      {/* Add image - available in EVERY view, not just the empty state.
          Without this the only way to load a second file is to click Home. */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="btn-secondary !px-2.5 !py-1.5 text-xs"
        aria-label={t('top.newFile')}
        title={t('top.newFile')}
      >
        <Icon name="plus" size={14} />
        <span className="hidden lg:inline">{t('top.newFile')}</span>
      </button>'''

new_add = '''      {/* Add image - available in EVERY view, not just the empty state.
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
      </button>'''

if old_add in content:
    content = content.replace(old_add, new_add)
    print("OK: add image button updated")
else:
    print("FAIL: add image button not found")

# 10. Update cancel button
old_cancel = '''      {isProcessing && (
        <button type="button" onClick={cancelProcessing} className="btn-danger !px-3 !py-1.5 text-xs">
          {t('process.cancel')}
        </button>
      )}'''

new_cancel = '''      {isProcessing && (
        <button type="button" onClick={cancelProcessing} className="topnav-btn btn-danger !px-3 !py-1.5 text-xs">
          {t('process.cancel')}
        </button>
      )}'''

if old_cancel in content:
    content = content.replace(old_cancel, new_cancel)
    print("OK: cancel button updated")
else:
    print("FAIL: cancel button not found")

# 11. Update file count span
old_count = '''      {files.length > 0 && !isProcessing && (
        <span className="hidden font-mono text-[10px] uppercase tracking-wider text-text-muted xl:inline">
          {t('status.images', { count: files.length })}
        </span>
      )}'''

new_count = '''      {files.length > 0 && !isProcessing && (
        <span className="hidden font-mono text-[10px] uppercase tracking-wider text-text-muted xl:inline">
          {t('status.images', { count: files.length })}
        </span>
      )}'''

if old_count in content:
    content = content.replace(old_count, new_count)
    print("OK: file count updated")
else:
    print("FAIL: file count not found")

f = open(filepath, 'w')
f.write(content)
f.close()
print("DONE: TopBar.tsx updated")
