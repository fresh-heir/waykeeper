import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Waykeeper",
  description:
    "An editorial daily planner that turns the chaos of the day into a readable route.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans text-foreground">{children}</body>
    </html>
  );
}
