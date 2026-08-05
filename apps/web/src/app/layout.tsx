import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { SpectrumRule } from "@/components/BrandMotif";
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
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        <footer className="no-print relative mt-4 border-t border-[var(--border)] bg-[rgba(8,13,26,0.55)]">
          <SpectrumRule />
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow)]">
                OpenCity Transit Lab
              </p>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                We map. We measure. We recommend. Civic decision support from verified open
                layers only.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Integrity
              </p>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                No fabricated equity scores. Unavailable or Not connected when a dataset or
                feed is missing.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Scope
              </p>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Not an official live MTC/CMRL operational feed unless an agency connector is
                plugged in.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
