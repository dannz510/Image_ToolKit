/**
 * Theme bootstrap - runs before paint to avoid a flash of the wrong theme.
 * Externally loaded (not inlined) so the page can ship a strict
 * `script-src 'self'` CSP with no 'unsafe-inline' or nonce.
 */
(function () {
  try {
    var saved = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = saved || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    if (theme === 'light') document.documentElement.classList.add('light');
  } catch (e) {
    // Storage blocked (private mode / cookies disabled) - default to dark.
    document.documentElement.classList.add('dark');
  }
})();
