import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditEmail } from '@/lib/ops/nav';
import { emailList, weekData, forgetKit, evId } from '@/lib/ops/emailkit';
import { saveLink } from '@/lib/ops/emaildata';
import { getBroadcast, setDescription } from '@/lib/kit';
import { loadCalendar } from '@/lib/calendar';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';

// GET ?what=week | emails  (&fresh=1 asks Kit again instead of using what was read in the last two minutes)
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const u = new URL(req.url), fresh = u.searchParams.get('fresh') === '1';
  try {
    const body = u.searchParams.get('what') === 'week' ? await weekData({ fresh }) : await emailList({ fresh });
    return NextResponse.json({ ...body, canEdit: canEditEmail(user) });
  } catch (e) { console.error('Email read failed', e.message); return NextResponse.json({ error: 'Couldn’t read the emails' }, { status: 502 }); }
}

// POST { action: 'attach', kit_id, event_id, confirm }   put an email under an event (writes the ID into Kit's internal description)
//      { action: 'archive' | 'restore', kit_ids: [..], note, confirm }   put emails away in Ops. Nothing is deleted, and nothing in Kit changes.
export async function POST(req) {
  const user = await currentUser();
  if (!canEditEmail(user)) return NextResponse.json({ error: 'Only the email team can change this' }, { status: 403 });
  const b = await req.json().catch(() => ({})), me = user.name || user.email;
  const bad = (error, status = 400) => NextResponse.json({ error }, { status });
  try {
    if (b.action === 'attach') {
      if (!b.confirm) return bad('Please confirm first');
      const ev = (await loadCalendar()).find(e => evId(e) === String(b.event_id || '').toUpperCase()); if (!ev) return bad('That event isn’t on the Master Schedule');
      const cur = await getBroadcast(b.kit_id).catch(() => null); if (!cur) return bad('Kit doesn’t have that email any more. Refresh the list.', 404);
      const id = evId(ev), has = new RegExp(`\\[${id}\\]`, 'i').test(`${cur.subject || ''} ${cur.description || ''}`);
      // Kit won't edit an email that has already gone out, so a sent email is matched in Ops only (the Email Links tab,
      // which the list reads first). Drafts and scheduled emails also get the [E###] tag in Kit's internal description.
      const sent = !!cur.published_at && new Date(cur.published_at) <= new Date();
      let wroteKit = false;
      if (!has && !sent) {
        try { await setDescription(b.kit_id, `[${id}] ${cur.description || ''}`.trim()); wroteKit = true; }
        catch (e) { console.error('Kit description write failed', e.message); return bad('Kit wouldn’t take the change, so nothing was saved.', 502); }
      }
      await saveLink(b.kit_id, { event_id: id, archived: '' }, me); forgetKit(); refreshSite();
      return NextResponse.json({ ok: true, wroteKit });
    }
    if (b.action === 'archive' || b.action === 'restore') {
      if (!b.confirm) return bad('Please confirm first');
      const ids = (Array.isArray(b.kit_ids) ? b.kit_ids : []).map(String).slice(0, 50); if (!ids.length) return bad('Pick an email');
      const list = (await emailList()).emails; let n = 0;
      for (const id of ids) {
        const x = list.find(e => e.kit_id === id); if (!x) continue;
        // Only an unsent draft, or the duplicate reminder, can be put away. A sent email is history.
        if (b.action === 'archive' && !(x.state === 'draft' || x.flags.includes('duplicate'))) continue;
        await saveLink(id, { archived: b.action === 'archive' ? 'TRUE' : '', note: String(b.note || '').slice(0, 200) }, me); n++;
      }
      forgetKit(); refreshSite();
      return NextResponse.json({ ok: true, changed: n });
    }
    return bad('Unknown request');
  } catch (e) {
    if (e?.name === 'ConflictError') return NextResponse.json({ error: 'Someone changed this a moment ago. Reload and try again.' }, { status: 409 });
    console.error('Email write failed', e.message); return NextResponse.json({ error: 'Couldn’t save that' }, { status: 502 });
  }
}
