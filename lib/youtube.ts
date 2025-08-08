export function extractVideoId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      const v = u.searchParams.get("v");
      if (v) return v;
    }
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "");
    }
    return null;
  } catch {
    return null;
  }
}

export function formatViewCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

export function selectThumbnail(thumbnails: any): string {
  if (thumbnails?.maxres?.url) return thumbnails.maxres.url;
  if (thumbnails?.high?.url) return thumbnails.high.url;
  if (thumbnails?.medium?.url) return thumbnails.medium.url;
  if (thumbnails?.default?.url) return thumbnails.default.url;
  return "";
}

export interface YouTubeMetadata {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  viewCount: number;
  commentCount: number;
  publishedAt: string;
  duration?: string;
}
