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

/**
 * Our own target: past it a page is heavy for a phone even where Shopify
 * still accepts it (the two ceilings above are Shopify's; this one is ours).
 * The editor's status bar says so, the CLI report measures against it. Raw
 * bytes — gzip takes a landing page to roughly a fifth, but the parser and
 * the memory of a cheap phone see the raw size.
 */
export const BUDGET_BYTES = 100 * 1024;
