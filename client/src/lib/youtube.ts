// Extract YouTube video ID from various URL formats
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  // Remove whitespace
  url = url.trim();

  // Format: https://youtu.be/dQw4w9WgXcQ
  // Format: https://youtu.be/dQw4w9WgXcQ?t=60
  // Format: https://youtu.be/dQw4w9WgXcQ?si=xxxxx
  // Format: https://youtu.be/-PXivr2hmMA?si=wZkD9nKYzRcehzNS
  const shortUrlMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortUrlMatch) return shortUrlMatch[1];

  // Format: https://www.youtube.com/watch?v=dQw4w9WgXcQ
  // Format: https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s
  // Format: https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=...
  const longUrlMatch = url.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
  if (longUrlMatch) return longUrlMatch[1];

  // Format: just the video ID
  const idMatch = url.match(/^([a-zA-Z0-9_-]{11})$/);
  if (idMatch) return idMatch[1];

  return null;
}

// Extract start time from YouTube URL
export function extractYouTubeStartTime(url: string): number | null {
  if (!url) return null;

  // Check for ?t=60 or ?t=60s
  const timeMatch = url.match(/[?&]t=(\d+)s?/);
  if (timeMatch) {
    return parseInt(timeMatch[1], 10);
  }

  // Check for #t=60 or #t=60s
  const hashMatch = url.match(/#t=(\d+)s?/);
  if (hashMatch) {
    return parseInt(hashMatch[1], 10);
  }

  return null;
}

// Validate YouTube URL
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

// Build embedded YouTube URL
export function buildYouTubeEmbedUrl(videoId: string, startTime?: number | null): string {
  let url = `https://www.youtube.com/embed/${videoId}`;
  if (startTime && startTime > 0) {
    url += `?start=${startTime}`;
  }
  return url;
}
