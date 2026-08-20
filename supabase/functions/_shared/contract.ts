/**
 * ═══════════════════════════════════════════════════════════════
 * WHICH VERSION OF THIS FUNCTION IS ACTUALLY RUNNING?
 * ═══════════════════════════════════════════════════════════════
 *
 * A `window_hours: 336` request and a `window_hours: 48` request returned
 * byte-identical bodies. Two readings fit that: the parameter was applied and
 * genuinely found nothing extra, or the deployed code had never heard of it.
 * From outside, nothing separated them — and the second turned out to be true,
 * detectable only because the response was missing a field the source has.
 *
 * That is this build's recurring defect in its purest form: two materially
 * different states producing indistinguishable output. "Nothing found" versus
 * "did not run". "Empty table" versus "refused query". "Applied your
 * parameter" versus "ignored your parameter".
 *
 * ⚠️ AN ABSENT FIELD IS A TERRIBLE SIGNAL AND IT IS WHAT WE HAD. It works
 * exactly once — the first time somebody happens to know which fields the
 * source returns and compares by eye. It cannot be scripted against, it gets
 * weaker every time the response shape changes for an unrelated reason, and it
 * requires the reader to already know the answer.
 *
 * So every function states its contract explicitly. `contract` is bumped
 * whenever the response shape changes; `deployed_at_build` is stamped by hand
 * at deploy time. If the number coming back is lower than the number in the
 * repo, the deployment is behind — one comparison, no field archaeology.
 */

/**
 * Bump when a function's response shape changes in a way a caller could
 * notice. tests/edge-contract.test.ts asserts the repo and the declared
 * response fields agree, so this cannot silently fall behind the code.
 *
 *   1  the original shape
 *   2  + window_hours (ccus-sweep), + contract on all three
 */
export const EDGE_CONTRACT = 2;

/** Every function's response carries this, so "is it deployed" is one field. */
export function contractStamp(): { contract: number } {
  return { contract: EDGE_CONTRACT };
}
