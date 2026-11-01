// The mentee's current partner(s) as emails, for the checks that only a partner may do (co-signing a class they watched).
import config from '../../data/mentee.json';
import { readTab, TABS, partnerFor, profilesFrom } from './content';
import { rotationFor } from './home';

export async function currentPartnerEmails(email, day) {
  const rows = await readTab(TABS.partners).catch(() => []);
  const rot = rotationFor(config.rotations, day);
  const mine = partnerFor(rows, email, config.season, day, { rotation: rot?.n, profiles: profilesFrom([]) });
  return (mine?.partners || []).map(p => p.email);
}
