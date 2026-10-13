// Course Library: the offering record, its choices, and the rules for when it can be published.
// Pure functions only (no network), so the desk, the form and the tests share one set of rules.

export const PROGRAMMES = [['meditation_mondays', 'Meditation Mondays'], ['wisdom_school', 'Wisdom School'], ['learning_pathways', 'Learning Pathways'], ['sadhana_school', 'Sādhana School'], ['seasonal', 'Seasonal'], ['on_demand', 'On demand']];
export const ACCESS = [['pwyc', 'Pay what you can'], ['meditation_pass', 'Meditation Pass'], ['wisdom_school', 'Wisdom School'], ['ws_plus', 'Wisdom School Plus'], ['sadhana_school', 'Sādhana School']];
export const KINDS = ['Live practice', 'Course', 'Learning Pathway', 'Season', 'Immersion / retreat', 'Certificate'];
export const FORMATS = ['Live', 'On demand', 'In person'];
export const DEPTHS = ['Start here', 'Deepen', 'Formation'];
export const TOPICS = ['Non-Dual Śākta-Śaiva', 'Tantra', 'Yoga philosophy', 'Meditation', 'Mantra', 'Sanskrit'];
export const MULTI_TEACHER = ['wisdom_school', 'sadhana_school'];

export const label = (list, v) => (list.find(([k]) => k === v) || [])[1] || v || '';
export const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Fields Circle owns: staff change these in Circle, never here. Used for "Changed in Circle" and the read-only panel.
export const CIRCLE_FIELDS = ['title', 'price_label', 'checkout_url', 'cover_url', 'circle_status'];
// Fields that come from teacher onboarding and stay editable
export const ONBOARDING_FIELDS = ['description', 'included', 'sessions', 'teachers', 'length', 'next_date'];

export function blankOffering(over = {}) {
  return {
    offering_id: '', circle_course_id: '', circle_paywall_id: '', onboarding_id: '', onboarding_source: '',
    title: '', cover_url: '', cover_override: '', price_label: '', checkout_url: '', circle_status: 'published',
    access: '', requires: '', unlock_note: '', programme: '', card_label: '', kind: '', format: '', depth: '', topics: [],
    teachers: [], length: '', next_date: '', next_session: '', ce_hours: '', description: '', included: [], sessions: [],
    director_email: '', sources: {},
    status: 'draft', skipped: false, found_at: '', published_at: '', updated_at: '',
    published_snapshot: null, flags: { circle: null, onboarding: null },
    ...over,
  };
}

export const coverOf = o => o.cover_override || o.cover_url || '';

// The nine fields on the inbox progress bar
export const NINE = [
  ['programme', o => !!o.programme], ['card_label', o => !!o.card_label.trim()], ['kind', o => !!o.kind], ['format', o => !!o.format], ['depth', o => !!o.depth],
  ['topics', o => o.topics.length > 0], ['teachers', o => o.teachers.length > 0], ['description', o => !!o.description.trim()], ['included', o => o.included.some(l => l.trim())],
];
export const progress = o => NINE.filter(([, ok]) => ok(o)).length;

// Faculty who still owe onboarding. `faculty` is [{ email, name, done }] from the onboarding link.
export const facultyPending = o => (o.faculty || []).filter(f => !f.done);

// What must be true before Publish. Each item: { key, label, ok, required }.
export function checklist(o, { faculty = null } = {}) {
  const req = [
    ['programme', 'Programme chosen', !!o.programme], ['kind', 'Kind chosen', !!o.kind], ['card_label', 'Card label written', !!o.card_label.trim()],
    ['description', 'Description written', !!o.description.trim()], ['included', 'At least one “What’s included” line', o.included.some(l => l.trim())],
  ].map(([key, text, ok]) => ({ key, label: text, ok, required: true }));
  const pend = faculty ?? facultyPending(o);
  const multi = MULTI_TEACHER.includes(o.programme) || (o.faculty || []).length > 1;
  if (multi && (o.faculty || []).length) req.push({ key: 'faculty', label: pend.length ? `Waiting on ${pend.map(f => f.name || f.email).join(', ')}` : 'Every faculty member has submitted', ok: !pend.length, required: true });
  req.push(
    { key: 'access', label: 'Access level set', ok: !!o.access, required: false },
    { key: 'checkout', label: 'Checkout link from Circle', ok: !!o.checkout_url, required: false },
    { key: 'cover', label: 'Cover picture', ok: !!coverOf(o), required: false },
    { key: 'format', label: 'Format and depth chosen', ok: !!(o.format && o.depth), required: false },
  );
  return req;
}
export const canPublish = (o, ctx) => checklist(o, ctx).filter(c => c.required).every(c => c.ok);

// Every filter the card will appear under on the site, in plain words
export function filtersLine(o) {
  const parts = [o.programme && label(PROGRAMMES, o.programme), o.kind, o.format, o.depth, ...(o.topics || [])].filter(Boolean);
  if (o.ce_hours) parts.push('CE credit');
  return parts.length ? `Will appear under: ${parts.join(' · ')}` : 'Choose a programme, kind, format and topics to see where this appears.';
}

// ---- Flags ----
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
export const circleSnapshot = o => Object.fromEntries(CIRCLE_FIELDS.map(f => [f, o[f] ?? '']));
export const onboardingSnapshot = o => Object.fromEntries(ONBOARDING_FIELDS.map(f => [f, o.onboarding_values?.[f] ?? '']));
export function circleChanges(o) {
  if (o.status !== 'published' || !o.published_snapshot?.circle) return [];
  return CIRCLE_FIELDS.filter(f => !same(o.published_snapshot.circle[f], o[f]));
}
export function onboardingChanges(o) {
  if (o.status !== 'published' || !o.published_snapshot?.onboarding) return [];
  return ONBOARDING_FIELDS.filter(f => !same(o.published_snapshot.onboarding[f], o.onboarding_values?.[f]));
}

export const FIELD_NAMES = { title: 'Title', price_label: 'Price', checkout_url: 'Checkout link', cover_url: 'Cover picture', circle_status: 'Status', description: 'Description', included: 'What’s included', sessions: 'Sessions', teachers: 'Teachers', length: 'Length', next_date: 'Next date' };

// The state the desk shows: new | changed | published | skipped
export function bucketOf(o) {
  if (o.skipped) return 'skipped';
  if (o.status === 'published') return circleChanges(o).length || onboardingChanges(o).length ? 'changed' : 'published';
  if (o.status === 'unpublished') return 'skipped';
  return 'new';
}
