// Text messages (SMS) and WhatsApp through Twilio, for the alert channel (lib/ops/alerts.js). Plain fetch to Twilio's REST API; no package.
//
// Settings, by name (values are never printed, logged or returned): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM (the number texts come from),
// TWILIO_WHATSAPP_FROM (the WhatsApp sender, a number; the sandbox's number while testing), TWILIO_WHATSAPP_TEMPLATE_SID (optional, see below).
// All are optional: a channel whose settings are missing is skipped and the alert says so ("WhatsApp not set up"); email carries on.
// TWILIO_BASE is for tests only: read only when set, it points this file at scripts/ops-test/twilio-mock.mjs. It is not set in production.
//
// WhatsApp rule (Twilio and Meta's, not ours): a business may send free text only inside 24 hours of the person's last message to it (the sandbox works this
// way too). Outside that window WhatsApp only delivers an approved TEMPLATE. With TWILIO_WHATSAPP_TEMPLATE_SID set, every WhatsApp alert goes as that template
// (ContentSid) with two variables: {{1}} the headline, {{2}} the link. Without it, WhatsApp is sent as free text.
//
// Phone numbers are personal data. They are never logged, never returned to a page except to the person they belong to, and never put in an error:
// every message that leaves this file has been through scrub().
const env = k => (process.env[k] || '').trim();
const BASE = () => (env('TWILIO_BASE') || 'https://api.twilio.com').replace(/\/+$/, '');

export const TWILIO_SETTINGS = [
  ['TWILIO_ACCOUNT_SID', 'Twilio account'],
  ['TWILIO_AUTH_TOKEN', 'Twilio access key'],
  ['TWILIO_SMS_FROM', 'The number text messages come from'],
  ['TWILIO_WHATSAPP_FROM', 'The WhatsApp sender'],
  ['TWILIO_WHATSAPP_TEMPLATE_SID', 'WhatsApp message template (needed outside WhatsApp’s 24-hour window)'],
];

export const smsReady = () => !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_SMS_FROM'));
export const whatsappReady = () => !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_WHATSAPP_FROM'));

// 'Not set up' (nothing set), 'Email only' (the account is set but no sender yet), then what is ready. Names only, never a value.
export function twilioStatus() {
  const any = TWILIO_SETTINGS.some(([n]) => env(n)), sms = smsReady(), wa = whatsappReady();
  const label = !any ? 'Not set up' : !sms && !wa ? 'Email only' : sms && wa ? 'Text and WhatsApp ready' : sms ? 'Text ready (WhatsApp not set up)' : 'WhatsApp ready (texts not set up)';
  const note = !any ? 'Alerts go by email only. Add the Twilio settings in Vercel to add text messages and WhatsApp.'
    : !sms && !wa ? 'The Twilio account is set but there is no text number or WhatsApp sender yet, so alerts still go by email only.'
      : `${sms ? 'Text messages are ready. ' : ''}${wa ? (env('TWILIO_WHATSAPP_TEMPLATE_SID') ? 'WhatsApp is ready, sent as your approved template.' : 'WhatsApp is ready, sent as plain text (works in the sandbox and inside WhatsApp’s 24-hour window; add the template for the rest).') : ''}`.trim();
  return { label, note, sms, whatsapp: wa, template: !!env('TWILIO_WHATSAPP_TEMPLATE_SID'), settings: TWILIO_SETTINGS.map(([name, what]) => ({ name, what, set: !!env(name) })) };
}

// ---- Numbers
export const normalizePhone = raw => {
  let s = String(raw ?? '').trim().replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  return s;
};
export const isE164 = n => /^\+[1-9]\d{7,14}$/.test(String(n || ''));
export const maskPhone = n => { const d = String(n || '').replace(/\D/g, ''); return d ? `••••${d.slice(-4)}` : ''; };
// Anything that looks like a phone number, an account number (AC…) or a secret is hidden before text is logged or shown
export const scrub = text => String(text ?? '')
  .split(env('TWILIO_AUTH_TOKEN') || '\u0000').join('••••')
  .replace(/\bAC[0-9A-Za-z]{20,}\b/g, 'AC••••')
  .replace(/\+?\d[\d\s().-]{6,}\d/g, m => `••••${m.replace(/\D/g, '').slice(-2)}`);

const WHY = { 20003: 'Twilio did not accept the account details (check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)',
  21211: 'Twilio says that number is not valid', 21614: 'Twilio says that number can’t receive text messages', 21408: 'Twilio does not allow messages to that country yet',
  21606: 'The sending number can’t send text messages', 63016: 'WhatsApp only delivers an approved template outside its 24-hour window (set TWILIO_WHATSAPP_TEMPLATE_SID)',
  63007: 'The WhatsApp sender is not set up in Twilio', 21610: 'That person has opted out of messages' };

// One message. channel: 'sms' | 'whatsapp'. Returns { ok: true, sid } or { ok: false, error } and never throws for what Twilio says.
export async function sendMessage({ channel, to, body, headline = '', link = '' }) {
  const ready = channel === 'whatsapp' ? whatsappReady() : smsReady();
  if (!ready) return { ok: false, notSetUp: true, error: channel === 'whatsapp' ? 'WhatsApp not set up' : 'Text messages not set up' };
  if (!isE164(to)) return { ok: false, error: 'That number is not a full international number' };
  const wa = channel === 'whatsapp', from = env(wa ? 'TWILIO_WHATSAPP_FROM' : 'TWILIO_SMS_FROM').replace(/^whatsapp:/i, '');
  const form = new URLSearchParams({ To: wa ? `whatsapp:${to}` : to, From: wa ? `whatsapp:${from}` : from });
  if (wa && env('TWILIO_WHATSAPP_TEMPLATE_SID')) { form.set('ContentSid', env('TWILIO_WHATSAPP_TEMPLATE_SID')); form.set('ContentVariables', JSON.stringify({ 1: headline || body.slice(0, 120), 2: link || '-' })); }
  else form.set('Body', body);
  try {
    const sid = env('TWILIO_ACCOUNT_SID');
    const res = await fetch(`${BASE()}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 429) return { ok: false, status: 429, error: 'Twilio asked us to slow down (too many messages). It will be tried again at the next check' };
    if (!res.ok) return { ok: false, status: res.status, error: scrub(WHY[j.code] || `Twilio said no${j.code ? ` (code ${j.code})` : ` (error ${res.status})`}`) };
    return { ok: true, sid: j.sid || '' };
  } catch (e) {
    return { ok: false, error: `Couldn’t reach Twilio (${e?.name === 'TimeoutError' ? 'it took too long' : 'network problem'})` };
  }
}
