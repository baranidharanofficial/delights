import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "POS — Delights",
  // Staff-only surface: keep it out of search results entirely.
  robots: { index: false, follow: false },
};

export default function PosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
