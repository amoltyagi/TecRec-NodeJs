import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/context/ToastContext";
import { getSiteUrl } from "@/lib/env";
import { MotionProvider } from "@/components/ui/MotionProvider";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  // Referenced from globals.css as var(--font-jakarta) so the @theme token points
  // at the hashed family next/font actually ships.
  variable: "--font-jakarta",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

const SITE_NAME = "TecRec Universal";
const SITE_DESCRIPTION =
  "Decode any tech product from its model code or a photo of the label — specs, release timing, market pricing and alternatives in seconds.";

export const metadata: Metadata = {
  // Same resolver as robots.txt/sitemap.xml, so canonical, OG and crawler URLs
  // can never disagree (and never fall back to localhost in production).
  metadataBase: new URL(getSiteUrl()),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} antialiased font-sans`}>
        <MotionProvider>
          <ToastProvider>
            <div className="aurora-bg" />
            {children}
          </ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
