"use client";

import { type YouTubeMetadata, formatViewCount } from "@/lib/youtube";

type Props = {
  metadata: YouTubeMetadata;
};

export default function VideoPreviewCard({ metadata }: Props) {
  const publishedDate = new Date(metadata.publishedAt).toLocaleDateString();
  const watchUrl = `https://www.youtube.com/watch?v=${metadata.id}`;

  return (
    <div className="flex gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
      <img
        src={metadata.thumbnail}
        alt={metadata.title}
        className="w-24 h-16 object-cover rounded flex-shrink-0"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-slate-800 hover:text-red-600 line-clamp-2 block"
        >
          {metadata.title}
        </a>
        <p className="text-xs text-slate-600 mt-1">{metadata.channel}</p>
        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
          {metadata.viewCount > 0 && <span>{formatViewCount(metadata.viewCount)} views</span>}
          {metadata.commentCount > 0 && <span>{formatViewCount(metadata.commentCount)} comments</span>}
          <span>{publishedDate}</span>
        </div>
      </div>
    </div>
  );
}
