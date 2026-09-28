import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YUU - Long-term rentals in Thailand",
  description:
    "Verified long-term homes in Thailand with clear deposits, video tours and English contracts.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
