/**
 * Re-exports the compiler so routes import from one place.
 *
 * The app deliberately does not have its own rendering path: the editor preview
 * and the publish output both come from this same function. That is invariant
 * I1 — one compiler — expressed as a module boundary.
 */
export { compile, toFragment } from '../../../packages/compiler/src/compile.ts';
export { ANIMATION_CSS } from '../../../packages/compiler/src/blocks.ts';
export { audit, score } from '../../../packages/compiler/src/audit.ts';
export type { Doc, Node } from '../../../packages/compiler/src/schema.ts';
export type { Finding } from '../../../packages/compiler/src/audit.ts';

/** Bumped whenever the compiler's output could change. Stored on every version. */
export const COMPILER_VERSION = '0.1.0';
