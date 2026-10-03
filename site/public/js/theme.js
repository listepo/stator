/*! stator theme toggle — cycles system → light → dark.
   Boot snippet in BaseLayout applies the theme before paint to avoid FOUC.
   Persist key: localStorage["stator-theme"] = "system" | "light" | "dark"
   The cycle runs from the in-memory `current`, not from storage: when storage is blocked
   (private mode, strict privacy settings) a re-read would return nothing after every click.
   The toggle ships `hidden` and is shown here, so without JS there is no dead button.
*/
(function () {
  const KEY = 'stator-theme';
  const ORDER = ['system', 'light', 'dark'];
  let current = 'system';

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function resolve(preference) {
    if (preference === 'light' || preference === 'dark') return preference;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(preference) {
    const pref = ORDER.includes(preference) ? preference : 'system';
    current = pref;
    const resolved = resolve(pref);
    const root = document.documentElement;
    root.setAttribute('data-theme', pref);
    root.setAttribute('data-theme-resolved', resolved);
    root.style.colorScheme = resolved;
    syncToggle(pref, resolved);
  }

  function syncToggle(pref, resolved) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const labels = {
      system: 'Theme: system (follows OS)',
      light: 'Theme: light',
      dark: 'Theme: dark',
    };
    btn.setAttribute('aria-label', labels[pref] || labels.system);
    btn.dataset.theme = pref;
    btn.dataset.resolved = resolved;
    const label = btn.querySelector('[data-theme-label]');
    if (label) label.textContent = pref;
  }

  function cycle() {
    const idx = ORDER.indexOf(current);
    const next = ORDER[(idx + 1) % ORDER.length];
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode */
    }
    apply(next);
  }

  window.__statorTheme = { apply, cycle, resolve, KEY };

  document.addEventListener('DOMContentLoaded', () => {
    apply(stored() || 'system');
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', cycle);
      btn.hidden = false;
    }
  });

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (current === 'system') apply('system');
    });
  } catch {
    /* older Safari */
  }
})();
