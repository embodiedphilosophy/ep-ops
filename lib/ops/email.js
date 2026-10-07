// Resend. Vercel: RESEND_API_KEY, RESEND_FROM (e.g. "Embodied Philosophy <team@embodiedphilosophy.com>")
export async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch((process.env.RESEND_BASE || 'https://api.resend.com') + '/emails', {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'Embodied Philosophy <team@embodiedphilosophy.com>', to, subject, html }),
  });
  if (!res.ok) throw new Error(`Email failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function layout(title, bodyHtml) {
  return `<div style="font-family:Georgia,serif;background:#FAF5EB;padding:28px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5DCCB;padding:28px">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;color:#A5432A;text-transform:uppercase">Embodied Philosophy</div>
    <h1 style="font-size:26px;color:#1E1A14;margin:10px 0 16px">${esc(title)}</h1>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3a342b">${bodyHtml}</div>
  </div></div>`;
}
export const button = (href, label) => `<p><a href="${esc(href)}" style="display:inline-block;background:#A5432A;color:#fff;padding:12px 18px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;
export { esc };
