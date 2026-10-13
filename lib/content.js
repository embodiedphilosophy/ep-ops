import { site as defaults } from './site';
import { readTab, published } from './sheet';
import { approvedProfiles } from './coursepages';
import teachersFallback from '@/data/teachers.json';
import testimonialsFallback from '@/data/testimonials.json';
import pathwaysFallback from '@/data/pathways.json';

// Sheet key → where it lands in the site config
const MAP = {
  wisdom_join: ['links', 'wisdomJoin'], wisdom_price: ['prices', 'wisdomYear'],
  meditation_monthly: ['links', 'meditationMonthly'], dropin_meditation: ['links', 'dropinMeditation'], meditation_yearly: ['links', 'meditationYearly'],
  sadhana_year: ['links', 'sadhanaYear'], sadhana_year_price: ['prices', 'sadhanaYear'],
  sadhana_semester: ['links', 'sadhanaSemester'], sadhana_semester_price: ['prices', 'sadhanaSemesterFrom'],
  sign_in: ['links', 'signIn'], sign_in_wisdom: ['links', 'signInWisdom'], sign_in_sadhana: ['links', 'signInSadhana'], hamsa_checkout: ['links', 'hamsaCheckout'],
  ce_price: ['prices', 'ce'], ce_join: ['links', 'ceJoin'], yacep: [null, 'yacep'],
  school_seat_price: ['prices', 'schoolSeat'], school_lecture_price: ['prices', 'schoolLecture'], school_license_price: ['prices', 'schoolLicense'], school_min_seats: ['prices', 'schoolMinSeats'],
  dropin_price: ['prices', 'dropin'], meditation_monthly_price: ['prices', 'meditationMonthly'], meditation_yearly_price: ['prices', 'meditationYearly'],
  wisdom_monthly: ['links', 'wisdomMonthly'], wisdom_monthly_price: ['prices', 'wisdomMonthly'],
  wisdom_plus_join: ['links', 'wisdomPlusJoin'], wisdom_plus_price: ['prices', 'wisdomPlusYear'],
  wisdom_plus_monthly: ['links', 'wisdomPlusMonthly'], wisdom_plus_monthly_price: ['prices', 'wisdomPlusMonthly'],
  library_hours: [null, 'libraryHours'], catalog: ['links', 'wisdomCatalog'], quiz: ['links', 'quiz'],
  tarka: ['links', 'tarkaSubstack'], sadhana_theme: [null, 'sadhanaTheme'],
};

export const photoKey = n => String(n || '').toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z]+/g, ' ').trim();

// The site config (links, prices, stats, theme), with any values from the sheet taking priority
export async function getSite() {
  const site = { ...defaults, links: { ...defaults.links }, prices: { ...defaults.prices } };
  const [links, stats] = await Promise.all([readTab('links'), readTab('stats')]);
  for (const row of links || []) {
    const target = MAP[row.key]; if (!target || !row.value) continue;
    const [group, key] = target;
    if (group) site[group][key] = row.value; else site[key] = row.value;
    if (row.key === 'tarka') site.links.tarkaPrint = row.value;
  }
  const s = (stats || []).filter(r => r.number && r.label)
    .sort((a, b) => Number(a.order || 99) - Number(b.order || 99))
    .map(r => ({ n: r.number, l: r.label }));
  if (s.length) site.stats = s;
  // teacher name → photo, for the faces on event cards
  site.photos = {};
  for (const t of await getTeachers().catch(() => [])) if (t.photo_url) site.photos[photoKey(t.name)] = t.photo_url;
  return site;
}

// Every row of the Teachers tab, published or not (teacher onboarding uses it to recognise returning teachers)
export async function getAllTeachers() {
  return ((await readTab('teachers')) || teachersFallback).filter(r => r.name);
}

export async function getTeachers() {
  const rows = await getAllTeachers();
  // A bio/headshot a teacher sent through onboarding, once approved, replaces the one on the Teachers tab
  const approved = Object.fromEntries((await approvedProfiles().catch(() => [])).map(p => [photoKey(p.name), p]));
  return rows.map(r => { const p = approved[photoKey(r.name)]; return p ? { ...r, bio: p.bio || r.bio, photo_url: p.photo_url || r.photo_url } : r; })
    .filter(r => published(r)).sort((a, b) => Number(a.order || 99) - Number(b.order || 99));
}

export async function getTestimonials(program = 'home') {
  const rows = (await readTab('testimonials')) || testimonialsFallback;
  return rows.filter(r => r.quote && published(r) && [program, 'all', ''].includes(String(r.program || '').toLowerCase()));
}

export async function getPathways() {
  const rows = (await readTab('pathways')) || pathwaysFallback;
  return rows.filter(r => r.title && published(r)).sort((a, b) => Number(a.order || 99) - Number(b.order || 99))
    .map(r => ({ ...r, courseList: String(r.courses || '').split(/;|\n/).map(c => c.trim()).filter(Boolean) }));
}
