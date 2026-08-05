import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
});

export const metadata: Metadata = {
  title: "OpenCity Transit Lab | Chennai Last-Mile Decision Support",
  description:
    "Civic evidence platform for Chennai public transport — verified open data only for policymakers, local bodies, traffic, and the public.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
