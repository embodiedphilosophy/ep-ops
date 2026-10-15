import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canSupport, canApprove, zendeskConfigured, reply, setStatus, addDraft, saveAnswer, setAnswerStatus } from '@/lib/ops/support';
import { ConflictError } from '@/lib/ops/store';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'pending', 'solved'];

// POST { action: 'reply', id, body, status, note } → reply to the customer (or an internal note) in Zendesk
// POST { action: 'status', id, status }               → change a ticket's status
// POST { action: 'draft', id, question, answer, topic } → a new Draft answer on the EP Support KB sheet
// POST { action: 'answer', row, changes, before }        → edit an answer (the KB's Entries tab)
// POST { action: 'approve' | 'retire' | 'reopen', row, before } → Live / Retired / back to Draft (approvers only)
export async function POST(req) {
  const user = await currentUser();
  if (!canSupport(user)) return NextResponse.json({ error: 'Only the support team can do this' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  try {
    if (b.action === 'draft') {
      if (!String(b.question || '').trim() || !String(b.answer || '').trim()) return NextResponse.json({ error: 'Add the question and the answer first' }, { status: 400 });
      await addDraft({ question: String(b.question).trim(), answer: String(b.answer).trim(), topic: String(b.topic || '').trim(), ticketId: id || '', who: user.name });
      refreshSite();
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'answer') {
      const row = Number(b.row);
      if (!row) return NextResponse.json({ error: 'Which answer?' }, { status: 400 });
      const changed = await saveAnswer(row, b.changes, b.before || {}, user);
      refreshSite();
      return NextResponse.json({ ok: true, changed });
    }
    if (['approve', 'retire', 'reopen'].includes(b.action)) {
      const row = Number(b.row);
      if (!row) return NextResponse.json({ error: 'Which answer?' }, { status: 400 });
      if (!canApprove(user)) return NextResponse.json({ error: 'Only Jacob, Irene or Floss can change whether an answer is live' }, { status: 403 });
      await setAnswerStatus(row, { approve: 'Live', retire: 'Retired', reopen: 'Draft' }[b.action], b.before || {}, user);
      refreshSite();
      return NextResponse.json({ ok: true });
    }
    if (!zendeskConfigured()) return NextResponse.json({ error: 'Zendesk isn’t connected yet' }, { status: 503 });
    if (!id) return NextResponse.json({ error: 'Which ticket?' }, { status: 400 });
    if (b.action === 'reply') {
      const body = String(b.body || '').trim();
      if (!body) return NextResponse.json({ error: 'Write a reply first' }, { status: 400 });
      if (b.status && !STATUSES.includes(b.status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
      await reply(id, { body, status: b.status, isPublic: !b.note, authorEmail: user.email });
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'status') {
      if (!STATUSES.includes(b.status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
      await setStatus(id, b.status);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: 'Someone changed this answer since you opened it. Reload to see their version.', conflict: e.current }, { status: 409 });
    console.error('Support action failed', e.message);
    return NextResponse.json({ error: 'That didn’t go through. Try again, or open the ticket in Zendesk.' }, { status: 502 });
  }
}
