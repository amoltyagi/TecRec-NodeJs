import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google"; // Use Plus Jakarta Sans to match design
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "TecRec Universal",
  description: "Universal Tech Decoder and Scanner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} antialiased font-sans`}>
        <div className="aurora-bg" />
        {children}
      </body>
    </html>
  );
}
