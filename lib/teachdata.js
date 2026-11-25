// Everything the onboarding screens (/teach) show one teacher, built in one place so the teacher's own view and the
// Ops preview (Faculty → Onboarding) are the same. userName: the signed-in person's name, used as a fallback guess.
import { onboardingState, deliverables, siteTeacher, usesCircle, names } from './teach';
import { listTasks } from './ops/taskstore';
import { visibleTo, bucket } from './ops/tasks';
import { todayET } from './events';
import { loadCopy } from './teachcopy';

const slim = t => ({ id: t.id, name: t.name, due: t.due, completed: t.completed });

export async function onboardingData(email, { actingAs = '', userName = '' } = {}) {
  const [st, copy] = await Promise.all([onboardingState(email), loadCopy()]);
  const firstTeachers = st.offerings.flatMap(o => names(o.teachers));
  // Best guess at their name until they confirm it: profile → Team tab → the only name on their sessions
  const guess = st.profile?.name || (!actingAs && userName) || (new Set(firstTeachers).size === 1 ? firstTeachers[0] : '');
  const site = st.profile ? null : await siteTeacher(guess).catch(() => null);
  const onFile = st.profile?.bio ? { name: st.profile.name, role: st.profile.role, bio: st.profile.bio, photo_url: st.profile.photo_url }
    : site?.bio ? { name: site.name, role: site.role, bio: site.bio, photo_url: site.photo_url } : null;

  // The bio/headshot item is listed once, on the first offering
  const offerings = await Promise.all(st.offerings.map(async (o, i) => ({
    ...o, circle: usesCircle(o.track), page: st.pages[o.key] || null,
    deliverables: await deliverables(o, { hasProfile: !!onFile || i > 0 }),
  })));

  let tasks = { pastDue: [], thisWeek: [], upcoming: [], done: [] };
  if (guess) {
    try { const b = bucket(visibleTo({ name: guess, roles: [], director: false }, await listTasks())); tasks = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.map(slim)])); } catch {}
  }
  return {
    email, actingAs, today: todayET(), nameGuess: guess, onFile,
    profileDone: !!st.profile, onboarded: !!st.profile?.onboarded_on, needed: st.needed,
    offerings, tasks, opsUrl: '/ops', circleHost: 'ss.embodiedphilosophy.com', copy,
  };
}
