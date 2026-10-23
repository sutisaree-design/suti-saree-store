// Guesses a <source type="..."> value from a video URL's file extension.
// Used as a fallback hint for mobile Safari/Chrome when the server's
// Content-Type header might be missing or generic — see
// app/media/[...path]/route.ts's resolveContentType() for the matching
// server-side fix.
const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
};

export function guessVideoMime(url: string | null | undefined): string {
  if (!url) return 'video/mp4';
  const clean = url.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] || 'video/mp4';
}
