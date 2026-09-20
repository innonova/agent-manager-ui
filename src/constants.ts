/**
 * A thinking item over this many characters folds in the transcript
 * (`TranscriptItem.vue`) instead of showing inline; the activity line's
 * live thinking box (`ActivityLine.vue`) uses the same cutoff so it only
 * shows text the transcript does not already display.
 */
export const THINKING_FOLD_CHARS = 600
