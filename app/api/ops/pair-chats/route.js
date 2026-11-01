import { NextResponse } from 'next/server';
import { runPairChats } from '@/lib/mentee/pairchats';
import { todayET } from '@/lib/events';

// Makes the Circle group chats for this rotation's articulation groups and stores their links (lib/mentee/pairchats.js). Needs ?key=CRON_SECRET.
//   ?mode=test   makes ONE chat with only Jacob in it and shows Circle's raw reply: run this first, then delete the test chat in Circle
//   ?mode=dry    lists what would be created
//   (no mode)    uses PAIR_CHATS (unset = does nothing)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const url = new URL(req.url), secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const mode = ['test', 'dry'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : undefined;
  try { return NextResponse.json(await runPairChats({ today: url.searchParams.get('today') || todayET(), ...(mode ? { mode } : {}) })); }
  catch (e) { console.error('pair-chats', e.message); return NextResponse.json({ error: 'Could not run the pair chats just now' }, { status: 502 }); }
}
