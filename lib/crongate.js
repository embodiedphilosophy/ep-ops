// During the move from ep-website, both projects carry the back-office jobs (daily, auto, Zoom sync, Weekly
// Scaffolding). Exactly one of them may run the real thing, or teachers get every reminder twice.
// ep-ops runs them once OPS_LIVE=1 is set in Vercel (set it at the same moment as OPS_ORIGIN on ep-website).
// Previews and dry runs always work.
export const jobsHere = () => process.env.OPS_LIVE === '1';
export const SKIPPED = { skipped: true, reason: 'Back-office jobs are paused on this project (OPS_LIVE is not 1).' };
