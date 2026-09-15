/**
 * Size ceilings every published page has to respect.
 *
 * One home for these numbers: the build script, the publish action and the
 * editor's status bar all read from here, so a change in one place cannot leave
 * another screen quoting a stale limit.
 */

/**
 * Shopify refuses a theme template larger than this (256 KB for Liquid
 * sections/layouts). It is the hard ceiling for the fragment we publish.
 * https://shopify.dev/docs/storefronts/themes/architecture/limits
 */
export const TEMPLATE_LIMIT_BYTES = 256 * 1024;

/**
 * A page's `body` lives in a database TEXT column at Shopify that caps at
 * 64 KB ("Description can't be larger than 64 kilobytes"). Pages on the
 * regular track go through `pageCreate`/`pageUpdate`, so this is the ceiling
 * that actually bites first.
 * https://shopify.dev/docs/storefronts/themes/troubleshooting/fix-64-kilobyte-limit-errors
 */
export const PAGE_BODY_LIMIT_BYTES = 64 * 1024;

/** Our own target, well below both ceilings, so complex pages keep headroom. */
export const BUDGET_BYTES = 100 * 1024;
