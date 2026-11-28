// The one place Ads asks the model a question (the same call pattern as the ad copy: ANTHROPIC_API_KEY, ANTHROPIC_BASE only in tests). It is sent aggregate numbers and EP's own words, nothing else;
// every answer is CHECKED by code before anything is kept (see insightsverify.js). Used by Audience insights and What we've learned.
const MODEL = 'claude-sonnet-5-5';
const base = () => (process.env.ANTHROPIC_BASE || 'https://api.anthropic.com').replace(/\/+$/, '');
export const keyIsSet = () => !!(process.env.ANTHROPIC_API_KEY || '').trim();

export async function ask(system, payload) {
  if (!keyIsSet()) return { state: 'no_key' };
  try {
    const res = await fetch(`${base()}/v1/messages`, {
      method: 'POST', signal: AbortSignal.timeout(50000), cache: 'no-store',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY.trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1800, system, messages: [{ role: 'user', content: JSON.stringify(payload) }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { state: 'failed' };
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    try { return { state: 'ok', json: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) }; } catch { return { state: 'failed' }; }
  } catch { return { state: 'failed' }; }
}
