import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitMash",
  description: "Synthesize multiple GitHub repositories into one project plan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
