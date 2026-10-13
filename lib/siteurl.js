// The public website lives in its own project (ep-website). Links from the dashboard to public pages must be
// absolute. Safe to import in client components.
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.embodiedphilosophy.com').replace(/\/$/, '');
