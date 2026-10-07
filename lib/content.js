import { readTab } from './sheet';
import teachersFallback from '@/data/teachers.json';

// The public Teachers tab (EP Website sheet, published as CSV: EVENTS_SHEET_CSV_URL), used to recognise
// teachers who are already on the website when they first sign in.
export const photoKey = n => String(n || '').toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z]+/g, ' ').trim();
export async function getAllTeachers() {
  return ((await readTab('teachers')) || teachersFallback).filter(r => r.name);
}
