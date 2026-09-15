/**
 * The D&VFly icon set: one stroked glyph per action or block, drawn here
 * from scratch on a 16-unit grid (1.5 stroke, round caps), so every icon in
 * the app has the same weight and the same optical size. Nothing here is a
 * font glyph or an emoji: those render differently on every machine and are
 * what made the first interface look assembled rather than designed.
 */
import type { CSSProperties } from 'react';

const PATHS = {
  back: <path d="M10 3L5 8l5 5" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" />,
  arrowUp: <path d="M8 13V3M4 7l4-4 4 4" />,
  arrowDown: <path d="M8 3v10M4 9l4 4 4-4" />,
  duplicate: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </>
  ),
  drag: (
    <g fill="currentColor" stroke="none">
      <circle cx="5.5" cy="3.5" r="1.1" />
      <circle cx="10.5" cy="3.5" r="1.1" />
      <circle cx="5.5" cy="8" r="1.1" />
      <circle cx="10.5" cy="8" r="1.1" />
      <circle cx="5.5" cy="12.5" r="1.1" />
      <circle cx="10.5" cy="12.5" r="1.1" />
    </g>
  ),
  edit: <path d="M11.3 2.7l2 2L6 12H4v-2zM9.8 4.2l2 2" />,
  brush: <path d="M13.2 2.8a1.4 1.4 0 0 0-2 0L6 8l2 2 5.2-5.2a1.4 1.4 0 0 0 0-2zM5.5 9c-1.6 0-2.5 1-2.5 2.5 0 .9-.5 1.5-1.5 2 2.5.4 5-.5 5-2.5" />,
  eye: (
    <>
      <path d="M1.5 8c1.8-2.7 4-4 6.5-4s4.7 1.3 6.5 4c-1.8 2.7-4 4-6.5 4S3.3 10.7 1.5 8z" />
      <circle cx="8" cy="8" r="1.8" />
    </>
  ),
  eyeOff: <path d="M2.5 9.5c1.6 1.7 3.4 2.5 5.5 2.5s3.9-.8 5.5-2.5M3 12.5l1.4-1.6M13 12.5l-1.4-1.6M8 12.2V14" />,
  settings: (
    <>
      <path d="M2 4.5h6.7M12.3 4.5H14M2 11.5h3.2M8.8 11.5H14" />
      <circle cx="10.5" cy="4.5" r="1.8" />
      <circle cx="7" cy="11.5" r="1.8" />
    </>
  ),
  undo: <path d="M6 4L3 7l3 3M3 7h6.5a3.5 3.5 0 0 1 0 7H8" />,
  redo: <path d="M10 4l3 3-3 3M13 7H6.5a3.5 3.5 0 0 0 0 7H8" />,
  help: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.4a1.9 1.9 0 0 1 3.7.4c0 1.2-1.9 1.4-1.9 2.6M8 11.6h.01" />
    </>
  ),
  external: <path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" />,
  chevronDown: <path d="M4 6l4 4 4-4" />,
  chevronRight: <path d="M6 4l4 4-4 4" />,
  layers: <path d="M8 2.5l6 3-6 3-6-3zM2 8.5l6 3 6-3M2 11.5l6 3 6-3" />,
  elements: (
    <>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <path d="M11.25 9.5v4M9.25 11.5h4" />
    </>
  ),
  keyboard: (
    <>
      <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
      <path d="M4 6.8h.01M6.7 6.8h.01M9.4 6.8h.01M12.1 6.8h.01M4.5 9.5h7" />
    </>
  ),
  check: <path d="M3 8.5l3 3 7-7" />,
  alert: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5M8 11h.01" />
    </>
  ),
  monitor: (
    <>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M5.5 14h5M8 11.5V14" />
    </>
  ),
  laptop: (
    <>
      <rect x="3" y="3" width="10" height="7.5" rx="1" />
      <path d="M1.5 13h13" />
    </>
  ),
  tablet: <rect x="3.5" y="1.5" width="9" height="13" rx="1.5" />,
  phone: (
    <>
      <rect x="5" y="1.5" width="6" height="13" rx="1.5" />
      <path d="M7.2 12.5h1.6" />
    </>
  ),
  store: <path d="M2.5 6.5L3.5 3h9l1 3.5M2.5 6.5V13h11V6.5M2.5 6.5h11M6.5 13V9.5h3V13" />,
  page: <path d="M4 2h5.5L13 5.5V14H4zM9.5 2v3.5H13" />,
  tag: <path d="M2.5 8.5V3h5.5l5.5 5.5-5.5 5.5zM5.5 6h.01" />,
  // ---- blocks --------------------------------------------------------------
  section: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6.5h12" />
    </>
  ),
  stack: (
    <>
      <rect x="2.5" y="2.5" width="11" height="4" rx="1" />
      <rect x="2.5" y="9.5" width="11" height="4" rx="1" />
    </>
  ),
  tabs: (
    <>
      <rect x="2" y="5.5" width="12" height="8" rx="1.5" />
      <path d="M2.5 5.5V3.5a1 1 0 0 1 1-1H7v3.5" />
    </>
  ),
  repeater: (
    <>
      <rect x="2.5" y="2.5" width="4" height="4" rx="1" />
      <rect x="9.5" y="2.5" width="4" height="4" rx="1" />
      <rect x="2.5" y="9.5" width="4" height="4" rx="1" />
      <rect x="9.5" y="9.5" width="4" height="4" rx="1" />
    </>
  ),
  heading: <path d="M3 3v10M9.5 3v10M3 8h6.5M12.5 6.5V13M11.3 7.6l1.2-1.1" />,
  text: <path d="M3 4h10M3 8h10M3 12h6" />,
  button: (
    <>
      <rect x="2" y="5" width="12" height="6" rx="3" />
      <path d="M5.5 8h5" />
    </>
  ),
  list: <path d="M6 4h7M6 8h7M6 12h7M3 4h.01M3 8h.01M3 12h.01" />,
  divider: <path d="M2 8h12M5 4.5h6M5 11.5h6" />,
  html: <path d="M6 4L2.5 8 6 12M10 4l3.5 4L10 12" />,
  image: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="5.5" cy="6.5" r="1.2" />
      <path d="M14 10.5l-3.5-3.5L4 13" />
    </>
  ),
  youtube: (
    <>
      <rect x="2" y="3.5" width="12" height="9" rx="2" />
      <path d="M7 6.2v3.6l3-1.8z" fill="currentColor" />
    </>
  ),
  accordion: (
    <>
      <rect x="2" y="3" width="12" height="3.5" rx="1" />
      <rect x="2" y="9.5" width="12" height="3.5" rx="1" />
      <path d="M10.5 4.75h1.5M10.5 11.25h1.5" />
    </>
  ),
  countdown: (
    <>
      <circle cx="8" cy="8.5" r="5" />
      <path d="M8 6v2.5l1.8 1.2M6.5 2h3" />
    </>
  ),
  contact: (
    <>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M2.5 5l5.5 4 5.5-4" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

/** Which icon each block type wears, in the palette, the tree and the inspector. */
export const BLOCK_ICONS: Record<string, IconName> = {
  section: 'section',
  stack: 'stack',
  tabs: 'tabs',
  tab: 'tabs',
  repeater: 'repeater',
  heading: 'heading',
  text: 'text',
  button: 'button',
  list: 'list',
  divider: 'divider',
  html: 'html',
  image: 'image',
  youtube: 'youtube',
  accordion: 'accordion',
  countdown: 'countdown',
  contact: 'contact',
};

export function Icon({ name, size = 16, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}
