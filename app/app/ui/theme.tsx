import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The D&VFly interface theme: one set of design tokens, two skins.
 *
 * Every screen-chrome color in the app goes through a `--dv-*` custom property
 * declared here — never a raw hex in a component. The dark skin is then one
 * attribute flip (`data-theme="dark"` on the `.dv-ui` root) instead of a
 * second stylesheet. The page being EDITED is not part of this: the canvas
 * paper stays white in both skins, because it previews the storefront, not
 * the editor.
 *
 * `color-scheme` rides along so native widgets (scrollbars, checkboxes,
 * selects, date pickers) follow the skin for free.
 */
export const UI_CSS = `
.dv-ui{
  --dv-sfc:#ffffff;
  --dv-sfc-sub:#fafafa;
  --dv-inset:#f1f1f1;
  --dv-inset2:#f4f4f4;
  --dv-edge:#e3e3e3;
  --dv-edge-soft:#ececec;
  --dv-edge-input:#d0d0d0;
  --dv-ink:#303030;
  --dv-ink-2:#616161;
  --dv-ink-3:#8a8a8a;
  --dv-ink-4:#c0c0c0;
  --dv-accent:#0be05c;
  --dv-accent-ink:#06301b;
  --dv-accent-text:#0a6b38;
  --dv-accent-tint:#eafaf0;
  --dv-accent-edge:#b6ecd0;
  --dv-danger:#b42318;
  --dv-danger-tint:#fdeeec;
  --dv-danger-edge:#f3c5be;
  --dv-link:#005bd3;
  --dv-warn-text:#8a6116;
  --dv-warn-tint:#fdf6e3;
  --dv-warn-edge:#f0e3b9;
  --dv-invert-bg:#17201c;
  --dv-invert-ink:#ffffff;
  --dv-toast-bg:#1a1a1a;
  --dv-toast-ink:#ffffff;
  --dv-canvas-bg:#f1f1f1;
  --dv-shadow-soft:0 1px 2px rgba(0,0,0,.15);
  --dv-shadow-page:0 1px 4px rgba(0,0,0,.12);
  --dv-shadow-pop:0 8px 24px rgba(0,0,0,.14);
  --dv-shadow-drawer:-8px 0 24px rgba(0,0,0,.15);
  --dv-backdrop:rgba(0,0,0,.28);
  color-scheme:light;
  accent-color:var(--dv-accent-text);
  background:var(--dv-sfc);
  color:var(--dv-ink);
}
.dv-ui[data-theme="dark"]{
  --dv-sfc:#191b1a;
  --dv-sfc-sub:#141615;
  --dv-inset:#242726;
  --dv-inset2:#202322;
  --dv-edge:#333835;
  --dv-edge-soft:#2a2e2c;
  --dv-edge-input:#404644;
  --dv-ink:#e7e9e7;
  --dv-ink-2:#aab0ac;
  --dv-ink-3:#7f8681;
  --dv-ink-4:#565c58;
  --dv-accent:#0be05c;
  --dv-accent-ink:#06301b;
  --dv-accent-text:#4ade80;
  --dv-accent-tint:#122b1d;
  --dv-accent-edge:#1e4a30;
  --dv-danger:#ff7a68;
  --dv-danger-tint:#33201d;
  --dv-danger-edge:#5c322c;
  --dv-link:#6fb1ff;
  --dv-warn-text:#dcb45e;
  --dv-warn-tint:#2a2415;
  --dv-warn-edge:#4c3f20;
  --dv-invert-bg:#e7e9e7;
  --dv-invert-ink:#141615;
  --dv-toast-bg:#f1f3f1;
  --dv-toast-ink:#1a1a1a;
  --dv-canvas-bg:#0e100f;
  --dv-shadow-soft:0 1px 2px rgba(0,0,0,.5);
  --dv-shadow-page:0 1px 6px rgba(0,0,0,.55);
  --dv-shadow-pop:0 8px 24px rgba(0,0,0,.55);
  --dv-shadow-drawer:-8px 0 24px rgba(0,0,0,.55);
  --dv-backdrop:rgba(0,0,0,.55);
  color-scheme:dark;
}
body{margin:0}
.dv-ui button{font-family:inherit}
.dv-ui button,.dv-ui input,.dv-ui select,.dv-ui textarea,.dv-ui a{
  transition:background-color .12s ease,border-color .12s ease,color .12s ease,filter .12s ease;
}
.dv-ui button:not(:disabled):hover{filter:brightness(.95)}
.dv-ui[data-theme="dark"] button:not(:disabled):hover{filter:brightness(1.2)}
.dv-ui :focus-visible{outline:2px solid var(--dv-accent);outline-offset:1px}
.dv-ui input::placeholder,.dv-ui textarea::placeholder{color:var(--dv-ink-3)}
`;

export const FONT_STACK = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/**
 * The tokens as a <style> element. innerHTML on purpose: SSR escapes the
 * quotes in `[data-theme="dark"]` when the CSS travels as a text child, and
 * hydration then flags a mismatch on every load.
 */
export function UiStyle() {
  return <style dangerouslySetInnerHTML={{ __html: UI_CSS }} />;
}

export type UiTheme = 'light' | 'dark';

const STORAGE_KEY = 'dvfly:ui-theme';

/**
 * The chosen skin, remembered per browser. First visit follows the system
 * preference. The load happens in an effect (never in the initializer):
 * the server renders light, and a client that disagreed during hydration
 * would produce a markup mismatch.
 */
export function useUiTheme(): [UiTheme, () => void] {
  const [theme, setTheme] = useState<UiTheme>('light');
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') setTheme(saved);
      else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark');
    } catch {
      // Storage unavailable (private window) — light stays.
    }
  }, []);

  // The write lives here, not inside the setState updater: StrictMode runs
  // updaters twice to flush out exactly that kind of side effect.
  const toggle = useCallback(() => {
    const next: UiTheme = themeRef.current === 'light' ? 'dark' : 'light';
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisting is fine; the toggle still works for this visit.
    }
    setTheme(next);
  }, []);

  return [theme, toggle];
}

/** Sun/moon toggle. The icon shows the skin you would SWITCH TO. */
export function ThemeToggle({
  theme,
  onToggle,
  style,
}: {
  theme: UiTheme;
  onToggle: () => void;
  style?: React.CSSProperties;
}) {
  const dark = theme === 'dark';
  const label = dark ? 'Tema claro' : 'Tema escuro';
  return (
    <button type="button" data-theme-toggle title={label} aria-label={label} onClick={onToggle} style={style}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark ? (
          <>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1.2V3M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M12.8 3.2l-1.3 1.3M4.5 11.5l-1.3 1.3" />
          </>
        ) : (
          <path d="M13.4 9.7A5.7 5.7 0 1 1 6.3 2.6a4.5 4.5 0 1 0 7.1 7.1z" />
        )}
      </svg>
    </button>
  );
}

// ---- shared pieces both screens compose -----------------------------------

const pillBase: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 11.5,
  fontWeight: 600,
  borderRadius: 999,
  padding: '2px 9px',
  whiteSpace: 'nowrap',
};

export const pillSuccess: React.CSSProperties = {
  ...pillBase,
  background: 'var(--dv-accent-tint)',
  border: '1px solid var(--dv-accent-edge)',
  color: 'var(--dv-accent-text)',
};

export const pillNeutral: React.CSSProperties = {
  ...pillBase,
  background: 'var(--dv-inset)',
  border: '1px solid var(--dv-edge)',
  color: 'var(--dv-ink-2)',
};

export const pillDanger: React.CSSProperties = {
  ...pillBase,
  background: 'var(--dv-danger-tint)',
  border: '1px solid var(--dv-danger-edge)',
  color: 'var(--dv-danger)',
};

const bannerBase: React.CSSProperties = {
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.45,
};

export const bannerOk: React.CSSProperties = {
  ...bannerBase,
  background: 'var(--dv-accent-tint)',
  border: '1px solid var(--dv-accent-edge)',
  color: 'var(--dv-accent-text)',
};

export const bannerErr: React.CSSProperties = {
  ...bannerBase,
  background: 'var(--dv-danger-tint)',
  border: '1px solid var(--dv-danger-edge)',
  color: 'var(--dv-danger)',
};

export const buttonPrimary: React.CSSProperties = {
  background: 'var(--dv-accent)',
  color: 'var(--dv-accent-ink)',
  border: 0,
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

export const buttonGhost: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--dv-ink-2)',
};
