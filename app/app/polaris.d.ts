/**
 * JSX types for the Polaris web components.
 *
 * Shopify ships these as custom elements from a CDN, with no npm package and so
 * no types. Without this file every `<s-page>` is an error to `tsc` and nothing
 * autocompletes.
 *
 * The attribute names below were read off the live bundle — each component's
 * `observedAttributes` — rather than transcribed from documentation, so they
 * match what the elements actually listen to. Attributes are all-lowercase
 * because that is what the DOM does to them; writing them camelCase in JSX would
 * silently produce an attribute nothing reads.
 *
 * Only the components this app uses are declared. Add more as they are needed —
 * and read them off the bundle the same way rather than guessing.
 */

import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'critical' | 'caution' | 'auto' | 'subdued';

type El<T = Record<string, unknown>> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & T;

declare global {
  namespace JSX {
    interface IntrinsicElements {
      's-page': El<{ heading?: string; inlinesize?: string }>;
      's-section': El<{ heading?: string; padding?: string; accessibilitylabel?: string }>;
      's-box': El<{
        background?: string;
        padding?: string;
        border?: string;
        borderradius?: string;
        blocksize?: string;
        inlinesize?: string;
        overflow?: string;
      }>;
      's-stack': El<{
        direction?: 'inline' | 'block';
        gap?: string;
        alignitems?: string;
        justifycontent?: string;
        padding?: string;
      }>;
      's-grid': El<{ gridtemplatecolumns?: string; gap?: string; alignitems?: string }>;
      's-grid-item': El<{ gridcolumn?: string }>;
      's-divider': El<{ color?: string }>;

      's-table': El<{ variant?: 'auto' | 'list' | 'table'; loading?: boolean }>;
      's-table-header-row': El;
      's-table-header': El<{ format?: 'auto' | 'text' | 'number'; listslot?: string }>;
      's-table-body': El;
      's-table-row': El;
      's-table-cell': El;

      's-button': El<{
        variant?: 'primary' | 'secondary' | 'tertiary' | 'auto';
        tone?: 'auto' | 'neutral' | 'critical';
        type?: 'button' | 'submit' | 'reset';
        disabled?: boolean;
        loading?: boolean;
        href?: string;
        target?: string;
        icon?: string;
        accessibilitylabel?: string;
      }>;
      's-link': El<{ href?: string; target?: string; tone?: Tone; accessibilitylabel?: string }>;
      's-badge': El<{ tone?: Tone; size?: string; icon?: string; color?: string }>;
      's-banner': El<{ heading?: string; tone?: Tone; dismissible?: boolean; hidden?: boolean }>;

      's-heading': El;
      's-paragraph': El<{ tone?: Tone; color?: string; lineclamp?: number }>;
      's-text': El<{ tone?: Tone; color?: string; type?: string; fontvariantnumeric?: string }>;

      's-text-field': El<{
        label?: string;
        name?: string;
        value?: string;
        placeholder?: string;
        prefix?: string;
        suffix?: string;
        details?: string;
        error?: string;
        required?: boolean;
        readonly?: boolean;
        disabled?: boolean;
        maxlength?: number;
        autocomplete?: string;
      }>;
      's-text-area': El<{
        label?: string;
        name?: string;
        value?: string;
        placeholder?: string;
        details?: string;
        error?: string;
        rows?: number;
        disabled?: boolean;
      }>;
      's-checkbox': El<{
        label?: string;
        name?: string;
        value?: string;
        checked?: boolean;
        details?: string;
        error?: string;
        disabled?: boolean;
      }>;
      's-spinner': El<{ size?: string; accessibilitylabel?: string }>;

      /**
       * App Bridge, not Polaris: its links are mirrored into the admin's
       * sidebar as the app's sub-navigation. Renders nothing by itself.
       */
      'ui-nav-menu': El;
    }
  }
}

export {};
