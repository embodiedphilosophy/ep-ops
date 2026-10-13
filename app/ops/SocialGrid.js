// Home's one-line social summary: what's wrong with an upcoming post, if anything
export const flagOf = p => !p.thumb ? 'No image yet' : p.review !== 'Kept' ? 'Image not reviewed' : '';
