import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { currentUser } from '@/lib/ops/auth';

// Headshots and readings upload straight from the browser to the ep-media Blob store (no size limit
// from our server). Vercel: BLOB_READ_WRITE_TOKEN (the ep-media store's token).
export async function POST(req) {
  const body = await req.json();
  try {
    const json = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async pathname => {
        if (!(await currentUser())) throw new Error('Please sign in again');
        const photo = pathname.startsWith('teachers/');
        if (!photo && !pathname.startsWith('readings/')) throw new Error('Unexpected upload');
        return {
          allowedContentTypes: photo ? ['image/jpeg', 'image/png', 'image/webp'] : ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/mp4'],
          maximumSizeInBytes: (photo ? 15 : 60) * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
