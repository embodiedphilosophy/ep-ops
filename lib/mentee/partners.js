// The mentee's current partner(s) as emails, for the checks that only a partner may do (co-signing a class they watched).
// Partners are chosen by the mentees each month (lib/mentee/pairing.js); the old assigned rows (Mentee Partners) count too, for
// classes logged in a month from before the change.
import config from '../../data/mentee.json';
import { readTab, TABS, partnerFor, profilesFrom } from './content';
import { rotationFor } from './home';
import { menteeAvailable, pairRows } from './store';
import { groupsFrom } from './pairing';

export async function currentPartnerEmails(email, day) {
  const e = String(email || '').toLowerCase(), out = new Set();
  if (menteeAvailable()) {
    const g = groupsFrom(await pairRows(config.season, String(day).slice(0, 7)).catch(() => [])).find(x => x.members.some(m => m.email === e));
    for (const m of g?.members || []) if (m.email !== e) out.add(m.email);
  }
  const rows = await readTab(TABS.partners).catch(() => []);
  const rot = rotationFor(config.rotations, day);
  const mine = partnerFor(rows, email, config.season, day, { rotation: rot?.n, profiles: profilesFrom([]) });
  for (const p of mine?.partners || []) out.add(p.email);
  return [...out];
}
