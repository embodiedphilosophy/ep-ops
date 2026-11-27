// Stand-in for Twilio's REST API for the alert tests. Port 4557. Nothing real is ever contacted.
//   TWILIO_BASE=http://localhost:4557 (env.sh sets it). The real Twilio settings are unset by env.sh; each flow gives the app throwaway ones.
// Endpoint: POST /2010-04-01/Accounts/<sid>/Messages.json (form-encoded: To, From, Body or ContentSid + ContentVariables), answered like Twilio (201 with a sid).
// Test controls: GET /__log (every request, newest last; ?reset=1 clears), GET /__mode?reject=1|0 (Twilio refuses with an invalid-number error that quotes the number, as the real one
// does), ?rateLimit=1|0 (429), ?rejectChannel=sms|whatsapp (refuse only that channel), GET /__reset.
// The log records To, From, Body, ContentSid, ContentVariables and whether Basic credentials were present (and whether they matched what the sender used), NEVER the account number or the
// key: so a test can prove the app's own logs and pages never contain a number, without this file ever holding a secret.
import http from 'node:http';

const PORT = Number(process.env.TWILIO_MOCK_PORT || 4557);
const log = [];
const mode = { reject: false, rateLimit: false, rejectChannel: '' };
let n = 0;
const send = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const body = req => new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => r(Object.fromEntries(new URLSearchParams(b)))); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  if (p === '/__log') { const out = { total: log.length, requests: log.slice() }; if (url.searchParams.get('reset')) log.length = 0; return send(res, 200, out); }
  if (p === '/__reset') { log.length = 0; n = 0; Object.assign(mode, { reject: false, rateLimit: false, rejectChannel: '' }); return send(res, 200, { reset: true }); }
  if (p === '/__mode') { for (const [k, v] of url.searchParams) mode[k] = k === 'rejectChannel' ? v : v === '1'; return send(res, 200, mode); }
  const m = /^\/2010-04-01\/Accounts\/([^/]+)\/Messages\.json$/.exec(p);
  if (!m || req.method !== 'POST') return send(res, 404, { code: 20404, message: 'Not found' });
  const b = await body(req), basic = /^Basic (\S+)$/.exec(req.headers.authorization || '');
  const [user, pass] = basic ? Buffer.from(basic[1], 'base64').toString().split(':') : ['', ''];
  const channel = String(b.To || '').startsWith('whatsapp:') ? 'whatsapp' : 'sms';
  log.push({ n: log.length + 1, channel, To: b.To, From: b.From, Body: b.Body, ContentSid: b.ContentSid, ContentVariables: b.ContentVariables, auth: !!basic, authMatchesAccount: user === m[1] && !!pass });
  if (!basic || user !== m[1] || !pass) return send(res, 401, { code: 20003, message: 'Authenticate', status: 401 });
  if (mode.rateLimit) return send(res, 429, { code: 20429, message: 'Too many requests', status: 429 });
  if (mode.reject || (mode.rejectChannel && mode.rejectChannel === channel)) return send(res, 400, { code: 21211, message: `The 'To' number ${String(b.To).replace(/^whatsapp:/, '')} is not a valid phone number.`, more_info: 'https://www.twilio.com/docs/errors/21211', status: 400 });
  if (!b.To || !b.From || (!b.Body && !b.ContentSid)) return send(res, 400, { code: 21602, message: 'Message body is required.', status: 400 });
  return send(res, 201, { sid: `SM${String(++n).padStart(32, '0')}`, status: 'queued', to: b.To, from: b.From });
}).listen(PORT, () => console.log(`twilio mock on :${PORT}`));
