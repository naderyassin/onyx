import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const pressStart2P = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Onyx — Save the internet, beautifully",
    template: "%s · Onyx",
  },
  description:
    "Paste a link, preview the media, and save it in the quality you want. Powered by yt-dlp and FFmpeg, running entirely on your machine.",
};

export const viewport: Viewport = {
  themeColor: "#060606",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} ${pressStart2P.variable}`}
    >
      <body className="min-h-svh overflow-x-hidden">
        <Providers>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[480px] bg-[radial-gradient(60%_65%_at_50%_0%,rgba(255,255,255,0.075),transparent_70%)]"
          />
          <Navbar />
          <main className="relative z-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
