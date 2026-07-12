import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Metronome",
  description: "A focused piano-practice metronome.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  openGraph: {
    title: "Metronome",
    description: "A focused piano-practice metronome.",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
