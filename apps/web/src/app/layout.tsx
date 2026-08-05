import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const display = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "OpenCity Transit Lab | Chennai Last-Mile Decision Support",
  description:
    "Civic evidence platform for Chennai public transport — verified open data only for policymakers, local bodies, traffic, and the public.",
};

export const viewport: Viewport = {
  themeColor: "#0a1f4a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${display.variable} ${sans.variable} antialiased`}>
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="no-print border-t border-[var(--border)] py-6 text-center text-sm text-[var(--ink-muted)]">
          OpenCity Transit Lab · Community and open government data · Not an official live
          MTC/CMRL operational feed unless an agency connector is plugged in
        </footer>
      </body>
    </html>
  );
}
