/**
 * Constants the browser bundle may carry.
 *
 * Route components render on the client too, so anything they read must not
 * come from a `.server.ts` module — React Router strips those from `loader`
 * and `action` only, and refuses the build when a component reaches into one.
 * The limits and names below are pure values from the packages, re-exported
 * from a client-safe path.
 */
export { BUDGET_BYTES, PAGE_BODY_LIMIT_BYTES, TEMPLATE_LIMIT_BYTES } from '../../../packages/compiler/src/limits.ts';
export { SOLO_SUFFIX } from '../../../packages/shopify/src/constants.ts';
