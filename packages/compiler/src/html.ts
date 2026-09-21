/**
 * HTML emission helpers.
 *
 * Everything user-authored is escaped on the way out. The only exception is the
 * `html` block, which exists precisely to be an escape hatch and says so.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Escapes an attribute value. Same rules, separate name for readability. */
export function escapeAttr(value: unknown): string {
  return escapeText(value);
}

/**
 * Builds an attribute string. Attributes whose value is `undefined`, `null` or
 * `false` are dropped; `true` emits a bare boolean attribute.
 */
export function attrs(map: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(map)) {
    if (value === undefined || value === null || value === false) continue;
    if (value === true) parts.push(name);
    else parts.push(`${name}="${escapeAttr(value)}"`);
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

/** A void element has no closing tag and no children. */
const VOID_ELEMENTS = new Set(['img', 'br', 'hr', 'input', 'source', 'link']);

export function tag(
  name: string,
  attributes: Record<string, unknown> = {},
  children = '',
): string {
  const open = `<${name}${attrs(attributes)}>`;
  if (VOID_ELEMENTS.has(name)) return open;
  return `${open}${children}</${name}>`;
}

/**
 * Only `http(s)`, `mailto:`, `tel:` and same-origin paths are allowed through.
 * A merchant pasting `javascript:` into a button URL should get an inert
 * button, not a stored XSS hole in their own storefront.
 */
export function safeUrl(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  if (raw.startsWith('/') || raw.startsWith('#')) return raw;
  return undefined;
}
