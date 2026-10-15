import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canSupport, zendeskConfigured, reply, setStatus, addDraft } from '@/lib/ops/support';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'pending', 'solved'];

// POST { action: 'reply', id, body, status, note } → reply to the customer (or an internal note) in Zendesk
// POST { action: 'status', id, status }               → change a ticket's status
// POST { action: 'draft', id, question, answer, topic } → a new Draft answer on the EP Support KB sheet
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
    console.error('Support action failed', e.message);
    return NextResponse.json({ error: 'That didn’t go through. Try again, or open the ticket in Zendesk.' }, { status: 502 });
  }
}
