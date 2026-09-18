import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commute Course",
  description: "Turn the trip into the lesson.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-950 text-slate-100 antialiased">
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
