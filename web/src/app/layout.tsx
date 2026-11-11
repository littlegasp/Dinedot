import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/inter";
import "./globals.css";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND.name,
  description: "Restaurant operating system: QR ordering, POS, kitchen and floor in one place.",
};
export const viewport: Viewport = { themeColor: "#171b24", width: "device-width", initialScale: 1 };

/* Sets the theme before first paint so there is no light flash for dark-mode users. */
const themeScript = `try{var t=localStorage.getItem("dineos.theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
