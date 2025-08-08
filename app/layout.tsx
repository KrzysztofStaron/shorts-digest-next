import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "YouTube Video Digest",
    template: "%s | YouTube Video Digest",
  },
  description:
    "Turn YouTube videos into concise, actionable summaries with key insights, highlights, and optional AI-generated visuals.",
  applicationName: "YouTube Video Digest",
  keywords: ["YouTube summary", "video digest", "AI summarization", "transcription", "actionable insights", "shorts"],
  authors: [{ name: "YouTube Video Digest" }],
  creator: "YouTube Video Digest",
  publisher: "YouTube Video Digest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "YouTube Video Digest",
    title: "YouTube Video Digest",
    description: "AI-powered summaries of YouTube videos with highlights and actionable key takeaways.",
    images: [
      {
        url: "/globe.svg",
        width: 1200,
        height: 630,
        alt: "YouTube Video Digest",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "YouTube Video Digest",
    description: "Turn YouTube videos into concise, actionable summaries with key insights and highlights.",
    images: ["/globe.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
  },
  referrer: "origin-when-cross-origin",
  category: "AI",
  themeColor: "#10b981",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
