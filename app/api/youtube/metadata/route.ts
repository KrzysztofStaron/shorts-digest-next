import { NextRequest, NextResponse } from "next/server";
import { extractVideoId, type YouTubeMetadata, selectThumbnail } from "@/lib/youtube";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "URL parameter required" }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  try {
    // Try YouTube Data API first
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,statistics&key=${apiKey}`;
      const response = await fetch(apiUrl);

      if (response.ok) {
        const data = await response.json();
        const video = data.items?.[0];

        if (video) {
          const metadata: YouTubeMetadata = {
            id: videoId,
            title: video.snippet.title,
            thumbnail: selectThumbnail(video.snippet.thumbnails),
            channel: video.snippet.channelTitle,
            viewCount: parseInt(video.statistics.viewCount || "0"),
            commentCount: parseInt(video.statistics.commentCount || "0"),
            publishedAt: video.snippet.publishedAt,
          };
          return NextResponse.json(metadata);
        }
      }
    }

    // Fallback to oEmbed
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oEmbedResponse = await fetch(oEmbedUrl);

    if (oEmbedResponse.ok) {
      const oEmbedData = await oEmbedResponse.json();
      const metadata: YouTubeMetadata = {
        id: videoId,
        title: oEmbedData.title || "Unknown Title",
        thumbnail: oEmbedData.thumbnail_url || "",
        channel: oEmbedData.author_name || "Unknown Channel",
        viewCount: 0,
        commentCount: 0,
        publishedAt: new Date().toISOString(),
      };
      return NextResponse.json(metadata);
    }

    return NextResponse.json({ error: "Could not fetch video metadata" }, { status: 404 });
  } catch (error) {
    console.error("YouTube metadata error:", error);
    return NextResponse.json({ error: "Failed to fetch metadata" }, { status: 500 });
  }
}
