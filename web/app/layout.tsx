import type { Metadata } from "next";
import { Suspense } from "react";
import { Zilla_Slab, Source_Sans_3, Courier_Prime } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import { RouteProgressBar } from "@/components/RouteProgressBar";
import "./globals.css";

// Matches design-demos/trail-v2.html's Google Fonts request exactly: normal 500,
// normal 700, and italic 500, but not italic 700 (never used by the approved demo).
const zillaSlab = Zilla_Slab({
  variable: "--font-zilla-slab",
  subsets: ["latin"],
  weight: ["500", "700"],
  style: ["normal"],
});

const zillaSlabItalic = Zilla_Slab({
  variable: "--font-zilla-slab-italic",
  subsets: ["latin"],
  weight: ["500"],
  style: ["italic"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Wonderloop",
  description: "A trail through the week's quests.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${zillaSlab.variable} ${zillaSlabItalic.variable} ${sourceSans.variable} ${courierPrime.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* useSearchParams (inside RouteProgressBar) requires a Suspense boundary; this one is
            fallback={null} because the bar renders nothing visible until a navigation is
            actually in flight (see components/RouteProgressBar.tsx). */}
        <Suspense fallback={null}>
          <RouteProgressBar />
        </Suspense>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
