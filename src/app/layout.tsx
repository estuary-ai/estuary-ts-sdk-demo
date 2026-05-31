import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

// Fonts are self-hosted in public/fonts/ (matching estuary-frontend). They're
// declared via @font-face in globals.css. We avoid next/font/google here
// because this environment can't reach fonts.googleapis.com at build time —
// next/font silently falls back to Arial when the download fails.

export const metadata: Metadata = {
  title: "Estuary Share",
  description: "Share and chat with Estuary AI characters",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

const noFlashScript = `
(function () {
  try {
    var t = localStorage.getItem('estuary-share-theme');
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.style.colorScheme = 'light';
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased font-sans">
        <Script id="theme-no-flash" strategy="beforeInteractive">
          {noFlashScript}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
