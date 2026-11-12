import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/inter";
import "./globals.css";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND.name,
  description: "Restaurant QR ordering, POS, kitchen and floor in one place.",
  // Added to a phone's home screen, the staff app opens full screen like an app.
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};
// viewportFit cover: the app may use the whole screen on phones with a notch; padding keeps content clear of it.
export const viewport: Viewport = { themeColor: "#171b24", width: "device-width", initialScale: 1, viewportFit: "cover" };

/* Before first paint: the theme (no light flash for dark-mode users), the bar colour on phones,
   and, on the staff app only, the phone-app manifest and icon (the guest page is not an app). */
const themeScript = `try{var t=localStorage.getItem("dineos.theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;if(localStorage.getItem("dineos.menu")==="folded")document.documentElement.dataset.menu="folded"}catch(e){}
try{var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=document.documentElement.dataset.theme==="dark"?"#0f1218":"#f5f6f8"}catch(e){}
if(!/\\/t(\\.html)?$/.test(location.pathname)){var h=document.head,l=document.createElement("link");l.rel="manifest";l.href="manifest.webmanifest";h.appendChild(l);l=document.createElement("link");l.rel="apple-touch-icon";l.href="apple-touch-icon.png";h.appendChild(l)}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
