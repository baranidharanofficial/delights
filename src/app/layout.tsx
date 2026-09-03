import type { Metadata, Viewport } from "next";
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
  title: "Delights",
  description: "Milkshakes, snacks and everything.",
};

/**
 * The cream the storefront is painted in, handed to the browser as well, so the
 * address bar and the task switcher continue the page instead of framing it.
 *
 * `colorScheme` is what stops the UA from styling a form control or a scrollbar
 * for a dark page on top of a light one. The POS layout replaces both fields —
 * viewport exports merge from the root down, and the deepest segment wins.
 */
export const viewport: Viewport = {
  themeColor: "#FEEBBF",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
