import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DriftingIcons } from "@/components/DriftingIcons";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaptionGen — captions & hashtags for social media",
  description:
    "Ready-to-post Instagram, LinkedIn and Facebook captions with hashtags, written in seconds. Built for small businesses and content creators.",
  applicationName: "CaptionGen",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e6f0fa",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="relative min-h-dvh font-sans">
        <DriftingIcons />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
