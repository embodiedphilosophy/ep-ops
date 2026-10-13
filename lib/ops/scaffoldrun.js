import { loadIssues, markIssue, weekEvents, buildIssue, nextSunday, addDays } from '@/lib/scaffolding';
import { createDraft, updateDraft, getBroadcast, isEditableDraft, draftUrl } from '@/lib/kit';
import { loadTeam } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { sendEmail, layout, button, esc } from '@/lib/ops/email';

// Build (or preview) the Weekly Scaffolding Kit draft for one Sunday. Shared by the Thursday cron
// (/api/scaffolding) and the dashboard's Build / Preview buttons (/api/ops/scaffolding).
// It never schedules or sends: the send button in Kit stays with a person.
// mode: 'build' | 'preview' (returns { html }) | 'dry' (what would happen). Returns { status, json } or { html }.

// Default: everyone except people tagged "Hold: Not yet welcomed" (imported members not yet released).
// Kit's API takes only one filter group (all / any / none), so a segment or tag setting replaces the exclusion.
// HOLD_TAG_ID=0 turns the exclusion off (then: all subscribers).
function audience() {
  const seg = Number(process.env.SCAFFOLDING_SEGMENT_ID || 0), tag = Number(process.env.SCAFFOLDING_TAG_ID || 0);
  const hold = Number(process.env.HOLD_TAG_ID ?? 24363585);
  if (seg) return [{ all: [{ type: 'segment', ids: [seg] }] }];
  if (tag) return [{ all: [{ type: 'tag', ids: [tag] }] }];
  if (hold) return [{ none: [{ type: 'tag', ids: [hold] }] }];
  return [{ all: [{ type: 'all_subscribers' }] }];
}

const reply = (json, init = {}) => ({ json, status: init.status || 200 });

export async function runScaffolding({ date, mode = 'build', origin = '' } = {}) {
  const sendDate = date || nextSunday(addDays(todayET(), 1));
  const preview = mode === 'preview', dry = mode === 'dry';

  const issues = await loadIssues();
  const issue = issues.find(i => i.send_date === sendDate);
  if (!issue) return reply({ error: `No row for ${sendDate} on the Weekly Scaffolding tab. Add one (Send Date = the Sunday).` }, { status: 404 });
  if (/^skip$/i.test(issue.status)) return reply({ skipped: `${sendDate} is marked Skip` });
  if (/^sent$/i.test(issue.status)) return reply({ skipped: `${sendDate} is marked Sent` });

  const events = await weekEvents(sendDate);
  const built = buildIssue(issue, events);

  if (preview) {
    // Liquid isn't run here: both versions of each button show, with the tag rule printed between them.
    const shown = built.content.replace(/\{%\s*if ([^%]+)%\}/g, '<p style="font:11px Arial;color:#888;margin:6px 0">[if $1]</p>')
      .replace(/\{%\s*else\s*%\}/g, '<p style="font:11px Arial;color:#888;margin:6px 0">[else]</p>').replace(/\{%\s*endif\s*%\}/g, '');
    return { html: `<!doctype html><meta charset="utf-8"><title>${esc(built.subject)}</title><body style="margin:0;background:#eee"><div style="max-width:600px;margin:20px auto;background:#FAF7EA">${shown}</div></body>` };
  }

  const summary = { send_date: sendDate, status: issue.status, subject: built.subject, events: events.map(e => `${e.date} ${e.track} ${e.title}${e.newsletter === 'enrolled_only' ? ' (enrolled only)' : ''}`), blanks: built.gaps };
  if (dry) return reply({ mode: 'dry run: nothing created', ...summary });

  const fields = {
    subject: built.subject, preview_text: built.preview_text, content: built.content,
    description: `Weekly Scaffolding ${sendDate} (built from EP-Programming-Calendar)`,
    email_template_id: Number(process.env.SCAFFOLDING_TEMPLATE_ID || 5578308),
    subscriber_filter: audience(),
  };

  // Update this week's draft if we already made one and it hasn't gone out; otherwise create
  const existingId = (String(issue.kit_draft || '').match(/campaigns\/(\d+)/) || [])[1];
  let broadcast, action = 'created';
  if (existingId) {
    const current = await getBroadcast(existingId).catch(() => null);
    if (current && !isEditableDraft(current)) {
      await markIssue(issue._row, { status: 'Sent', draftUrl: draftUrl(existingId), builtAt: issue.built_at });
      return reply({ skipped: 'That issue is already scheduled or sent in Kit; nothing changed.', draft: draftUrl(existingId) });
    }
    if (current) { broadcast = await updateDraft(existingId, fields); action = 'updated'; }
  }
  if (!broadcast) broadcast = await createDraft(fields);

  const link = draftUrl(broadcast.id);
  const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  await markIssue(issue._row, { status: built.gaps.length ? '' : 'In Kit', draftUrl: link, builtAt });

  // Tell the directors (Team tab, Type = director)
  const notified = [];
  try {
    const team = await loadTeam({ fresh: true });
    const base = process.env.OPS_URL || origin;
    const html = layout(`Weekly Scaffolding for ${sendDate} is in Kit`, `
      <p>The draft is ready to review in Kit. Nothing has been scheduled.</p>
      ${built.gaps.length ? `<p><b>Still blank on the sheet:</b> ${built.gaps.map(esc).join(', ')}. Fill them in, then rebuild.</p>` : ''}
      <p><b>Events this week:</b></p><ul>${summary.events.map(e => `<li>${esc(e)}</li>`).join('') || '<li>None</li>'}</ul>
      ${button(link, 'Open the draft in Kit')}
      <p style="font-size:13px;color:#777">Changed the text? Edit it and rebuild from <a href="${esc(`${base}/ops/content?tab=email`)}">Content → Email</a> (a rebuild replaces edits made inside Kit).</p>`);
    for (const d of team.filter(t => t.director && t.email)) {
      await sendEmail({ to: d.email, subject: `${built.gaps.length ? 'Needs content: ' : ''}Weekly Scaffolding draft for ${sendDate}`, html });
      notified.push(d.email);
    }
  } catch (e) { console.error('Scaffolding notice failed', e.message); }

  return reply({ action, draft: link, notified, ...summary });
}
