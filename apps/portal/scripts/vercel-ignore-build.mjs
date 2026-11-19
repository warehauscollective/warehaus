/**
 * Ignored Build Step for warehaus-portal. Exit 0 skips the build.
 * Exit 1 only when the review-preview workflow sets REVIEW_PREVIEW=1.
 * Must stay in step with ignoreBuildExitCode in convex/_lib/reviewPreview.ts.
 */
process.exit(process.env.REVIEW_PREVIEW === '1' ? 1 : 0);
