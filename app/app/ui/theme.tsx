import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The D&VFly interface theme: one set of design tokens, two skins.
 *
 * The app lives inside the Shopify admin, so it dresses like the admin: a
 * quiet gray page, white surfaces with hairline borders, one dark primary
 * button, sentence-case labels, and color only where it carries meaning
 * (a status, a link, a warning). The brand green marks the selection and
 * what is live — never the whole screen.
 *
 * Every screen-chrome color goes through a `--dv-*` custom property declared
 * here — never a raw hex in a component. The dark skin is one attribute flip
 * (`data-theme="dark"` on the `.dv-ui` root). The page being EDITED is not
 * part of this: the canvas paper stays white in both skins, because it
 * previews the storefront, not the editor.
 *
 * `color-scheme` rides along so native widgets (scrollbars, checkboxes,
 * selects) follow the skin for free.
 */
export const UI_CSS = `
.dv-ui{
  --dv-bg:#f1f1f1;
  --dv-sfc:#ffffff;
  --dv-sfc-sub:#f7f7f7;
  --dv-sfc-hover:#f3f3f3;
  --dv-inset:#ebebeb;
  --dv-inset2:#f1f1f1;
  --dv-edge:#e3e3e3;
  --dv-edge-soft:#ebebeb;
  --dv-edge-strong:#cfcfcf;
  --dv-edge-input:#8a8a8a;
  --dv-ink:#303030;
  --dv-ink-2:#616161;
  --dv-ink-3:#8a8a8a;
  --dv-ink-4:#b5b5b5;
  --dv-primary:#303030;
  --dv-primary-hover:#1a1a1a;
  --dv-primary-ink:#ffffff;
  --dv-accent:#0a8f4a;
  --dv-accent-ink:#ffffff;
  --dv-accent-text:#0a6b38;
  --dv-accent-tint:#e8f6ee;
  --dv-accent-edge:#b9e3ca;
  --dv-success-bg:#cdfed4;
  --dv-success-ink:#0c5132;
  --dv-info-bg:#e0f0ff;
  --dv-info-ink:#00527c;
  --dv-danger:#8e1f0b;
  --dv-danger-bg:#fed3d1;
  --dv-danger-tint:#fdeeed;
  --dv-danger-edge:#f3c4c0;
  --dv-link:#005bd3;
  --dv-focus:#005bd3;
  --dv-warn-text:#5e4200;
  --dv-warn-tint:#fff4d6;
  --dv-warn-edge:#f5d78a;
  --dv-invert-bg:#202320;
  --dv-invert-ink:#ffffff;
  --dv-toast-bg:#202320;
  --dv-toast-ink:#ffffff;
  --dv-canvas-bg:#ececec;
  --dv-shadow-btn:0 1px 0 rgba(0,0,0,.05);
  --dv-shadow-soft:0 1px 2px rgba(0,0,0,.08);
  --dv-shadow-page:0 2px 10px rgba(0,0,0,.08);
  --dv-shadow-pop:0 8px 24px rgba(0,0,0,.14);
  --dv-backdrop:rgba(0,0,0,.28);
  color-scheme:light;
  accent-color:var(--dv-primary);
  background:var(--dv-sfc);
  color:var(--dv-ink);
}
.dv-ui[data-theme="dark"]{
  --dv-bg:#141414;
  --dv-sfc:#1f1f1f;
  --dv-sfc-sub:#262626;
  --dv-sfc-hover:#2a2a2a;
  --dv-inset:#303030;
  --dv-inset2:#2a2a2a;
  --dv-edge:#3a3a3a;
  --dv-edge-soft:#333333;
  --dv-edge-strong:#4a4a4a;
  --dv-edge-input:#5c5c5c;
  --dv-ink:#e8e8e8;
  --dv-ink-2:#b3b3b3;
  --dv-ink-3:#8a8a8a;
  --dv-ink-4:#5c5c5c;
  --dv-primary:#e8e8e8;
  --dv-primary-hover:#ffffff;
  --dv-primary-ink:#1a1a1a;
  --dv-accent:#2fbf6d;
  --dv-accent-ink:#0a2a18;
  --dv-accent-text:#6fd79b;
  --dv-accent-tint:#17301f;
  --dv-accent-edge:#245c3a;
  --dv-success-bg:#173a2a;
  --dv-success-ink:#8fe0b0;
  --dv-info-bg:#17304a;
  --dv-info-ink:#9ac9ff;
  --dv-danger:#ff8a7a;
  --dv-danger-bg:#5c2f2a;
  --dv-danger-tint:#3a1f1c;
  --dv-danger-edge:#5c2f2a;
  --dv-link:#7bb6ff;
  --dv-focus:#7bb6ff;
  --dv-warn-text:#f0d36b;
  --dv-warn-tint:#3a3012;
  --dv-warn-edge:#5c4a1a;
  --dv-invert-bg:#e8e8e8;
  --dv-invert-ink:#141414;
  --dv-toast-bg:#f1f1f1;
  --dv-toast-ink:#1a1a1a;
  --dv-canvas-bg:#0f0f0f;
  --dv-shadow-btn:0 1px 0 rgba(0,0,0,.4);
  --dv-shadow-soft:0 1px 2px rgba(0,0,0,.5);
  --dv-shadow-page:0 2px 12px rgba(0,0,0,.6);
  --dv-shadow-pop:0 8px 24px rgba(0,0,0,.6);
  --dv-backdrop:rgba(0,0,0,.55);
  color-scheme:dark;
}
body{margin:0}
.dv-ui,.dv-ui *{box-sizing:border-box}
.dv-ui button,.dv-ui input,.dv-ui select,.dv-ui textarea{font-family:inherit}
.dv-ui button,.dv-ui input,.dv-ui select,.dv-ui textarea,.dv-ui a{
  transition:background-color .12s ease,border-color .12s ease,color .12s ease,box-shadow .12s ease,opacity .12s ease;
}
.dv-ui :focus-visible{outline:2px solid var(--dv-focus);outline-offset:1px}
.dv-ui input::placeholder,.dv-ui textarea::placeholder{color:var(--dv-ink-3)}
.dv-ui ::-webkit-scrollbar{width:10px;height:10px}
.dv-ui ::-webkit-scrollbar-thumb{background:var(--dv-edge-strong);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
.dv-ui ::-webkit-scrollbar-track{background:transparent}

/* Buttons: one primary per screen, secondary for the rest, plain for rows. */
.dv-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:13px;font-weight:500;line-height:20px;border-radius:8px;padding:5px 12px;cursor:pointer;white-space:nowrap;border:1px solid transparent;text-decoration:none;color:inherit;background:transparent}
.dv-btn:disabled,.dv-btn[aria-disabled="true"]{cursor:default;opacity:.5}
.dv-primary{background:var(--dv-primary);color:var(--dv-primary-ink);border-color:var(--dv-primary)}
.dv-primary:not(:disabled):hover{background:var(--dv-primary-hover);border-color:var(--dv-primary-hover)}
.dv-secondary{background:var(--dv-sfc);color:var(--dv-ink);border-color:var(--dv-edge-strong);box-shadow:var(--dv-shadow-btn)}
.dv-secondary:not(:disabled):hover{background:var(--dv-sfc-hover)}
.dv-plain{color:var(--dv-ink-2);padding:4px 8px}
.dv-plain:not(:disabled):not([aria-disabled="true"]):hover{background:var(--dv-sfc-hover);color:var(--dv-ink)}
.dv-plain[data-danger]{color:var(--dv-danger)}
.dv-plain[data-danger]:not(:disabled):hover{background:var(--dv-danger-tint);color:var(--dv-danger)}
.dv-plain[data-on]{background:var(--dv-inset);color:var(--dv-ink)}
.dv-icon-btn{width:32px;height:32px;padding:0}
.dv-link{color:var(--dv-link);text-decoration:none}
.dv-link:hover{text-decoration:underline}

/* The editor's icon rail. */
.dv-rail-btn{width:40px;height:40px;border-radius:8px;border:0;background:transparent;color:var(--dv-ink-2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;position:relative}
.dv-rail-btn:hover{background:var(--dv-sfc-hover);color:var(--dv-ink)}
.dv-rail-btn[data-on]{background:var(--dv-inset);color:var(--dv-ink)}
.dv-rail-btn[data-on]::before{content:"";position:absolute;left:-8px;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--dv-accent)}

/* Element cards in the palette. */
.dv-card-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:64px;padding:8px 4px;border:1px solid var(--dv-edge);border-radius:8px;background:var(--dv-sfc);color:var(--dv-ink-2);font-size:11.5px;line-height:1.2;text-align:center;cursor:pointer}
.dv-card-btn:hover{border-color:var(--dv-edge-input);color:var(--dv-ink);background:var(--dv-sfc-hover)}
.dv-card-btn:active{background:var(--dv-inset)}

/* Structure tree rows. */
.dv-tree-row{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;color:var(--dv-ink);text-align:left;font-size:13px;line-height:20px;padding:4px 8px;border-radius:6px;cursor:pointer}
.dv-tree-row:hover{background:var(--dv-sfc-hover)}
.dv-tree-row[data-tree-selected]{background:var(--dv-accent-tint);color:var(--dv-accent-text);font-weight:500}
.dv-tree-row .dv-tree-tools{opacity:0}
.dv-tree-row:hover .dv-tree-tools,.dv-tree-row:focus-within .dv-tree-tools,.dv-tree-row[data-tree-selected] .dv-tree-tools,.dv-tree-row[data-tree-hidden] .dv-tree-tools{opacity:1}

/* Underline tabs (inspector, pages list). */
.dv-tab{border:0;background:transparent;color:var(--dv-ink-2);font-size:13px;font-weight:500;padding:8px 12px;cursor:pointer;border-radius:8px 8px 0 0;display:inline-flex;align-items:center;gap:6px;box-shadow:inset 0 -2px 0 transparent}
.dv-tab:hover{color:var(--dv-ink);background:var(--dv-sfc-hover)}
.dv-tab[data-on]{color:var(--dv-ink);box-shadow:inset 0 -2px 0 var(--dv-ink)}

/* Fields. */
.dv-input{font-size:13px;line-height:20px;padding:5px 10px;border:1px solid var(--dv-edge-input);border-radius:8px;background:var(--dv-sfc);color:var(--dv-ink);width:100%}
.dv-input:focus{outline:none;border-color:var(--dv-focus);box-shadow:0 0 0 1px var(--dv-focus)}

/* Table rows. */
.dv-row:hover td{background:var(--dv-sfc-sub)}

/* Buttons without a class keep a gentle hover. */
.dv-ui button:not(:disabled):not(.dv-btn):not(.dv-rail-btn):not(.dv-card-btn):not(.dv-tree-row):not(.dv-tab):hover{filter:brightness(.96)}
.dv-ui[data-theme="dark"] button:not(:disabled):not(.dv-btn):not(.dv-rail-btn):not(.dv-card-btn):not(.dv-tree-row):not(.dv-tab):hover{filter:brightness(1.15)}

.dv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
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
  className,
}: {
  theme: UiTheme;
  onToggle: () => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const dark = theme === 'dark';
  const label = dark ? 'Tema claro' : 'Tema escuro';
  return (
    <button type="button" data-theme-toggle title={label} aria-label={label} onClick={onToggle} style={style} className={className}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

/** Status badges, the admin way: tinted, sentence case, no border. */
const badgeBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  fontWeight: 500,
  lineHeight: '16px',
  borderRadius: 8,
  padding: '2px 8px',
  whiteSpace: 'nowrap',
};

export const pillSuccess: React.CSSProperties = {
  ...badgeBase,
  background: 'var(--dv-success-bg)',
  color: 'var(--dv-success-ink)',
};

export const pillNeutral: React.CSSProperties = {
  ...badgeBase,
  background: 'var(--dv-inset)',
  color: 'var(--dv-ink-2)',
};

export const pillInfo: React.CSSProperties = {
  ...badgeBase,
  background: 'var(--dv-info-bg)',
  color: 'var(--dv-info-ink)',
};

export const pillDanger: React.CSSProperties = {
  ...badgeBase,
  background: 'var(--dv-danger-bg)',
  color: 'var(--dv-danger)',
};

const bannerBase: React.CSSProperties = {
  borderRadius: 8,
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

/** Inline-style twins of `.dv-primary` / `.dv-secondary`, for spots that compose styles. */
export const buttonPrimary: React.CSSProperties = {
  background: 'var(--dv-primary)',
  color: 'var(--dv-primary-ink)',
  border: '1px solid var(--dv-primary)',
  borderRadius: 8,
  padding: '5px 12px',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: '20px',
  cursor: 'pointer',
};

export const buttonGhost: React.CSSProperties = {
  border: '1px solid var(--dv-edge-strong)',
  background: 'var(--dv-sfc)',
  boxShadow: 'var(--dv-shadow-btn)',
  borderRadius: 8,
  padding: '5px 12px',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: '20px',
  cursor: 'pointer',
  color: 'var(--dv-ink)',
};
