// Pictures and video go from the browser straight to Google Drive, so Vercel's request-size limit never
// applies. The server only opens the upload ("resumable session") and hands the browser its one-time address.
// The file is saved as a real Workspace user (domain-wide delegation, the way Meet rooms are made), because
// a service account has no Drive space of its own.
// Vercel: DRIVE_UPLOAD_USER (the Workspace user who owns the folder), SOCIAL_UPLOADS_FOLDER_ID (the "Social Uploads" folder).
// One-time Google Workspace step: allow the website's service account the scope https://www.googleapis.com/auth/drive.file.
import { delegatedToken } from '../google';

const API = () => process.env.DRIVE_API_BASE || 'https://www.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const driveUploadConfigured = () => !!(process.env.DRIVE_UPLOAD_USER && process.env.SOCIAL_UPLOADS_FOLDER_ID);
export const ALLOWED = { image: ['image/jpeg', 'image/png', 'image/webp'], video: ['video/mp4', 'video/quicktime'] };
export const MAX_BYTES = { image: 30e6, video: 1e9 };

// → { url } the address the browser PUTs the file to (it answers with the new file's id)
export async function startUpload({ name, size, type, origin, folderId = process.env.SOCIAL_UPLOADS_FOLDER_ID }) {
  const t = await delegatedToken(SCOPE, process.env.DRIVE_UPLOAD_USER.trim());
  const res = await fetch(`${API()}/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id`, {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(size), ...(origin && { Origin: origin }) },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const url = res.headers.get('location');
  if (!res.ok || !url) throw new Error(`Drive wouldn’t start the upload (${res.status})`);
  return { url };
}

// Anyone with the link can view the file (Meta and the thumbnails fetch it without signing in)
export async function shareFile(id) {
  const t = await delegatedToken(SCOPE, process.env.DRIVE_UPLOAD_USER.trim());
  const res = await fetch(`${API()}/drive/v3/files/${id}/permissions?supportsAllDrives=true`, { method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
  if (!res.ok) throw new Error(`Couldn’t share the file (${res.status})`);
}
