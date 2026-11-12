import type { NextConfig } from "next";
import { mkdirSync, writeFileSync } from "node:fs";
import { BRAND } from "./src/lib/brand";

/**
 * The web app. Built into plain files (like Studio CRM) and served by Cloudflare.
 * Pages: index.html (staff app, hash routes) and t.html?k=<QR token> (guest page).
 * PREVIEW=1 uses relative asset paths so the build can be opened from any folder (review
 * links); normal builds use absolute paths.
 * Every build gets a stamp; the app compares it with public/version.json to offer "Refresh now".
 * The phone-app manifest is written here too, from src/lib/brand.ts, so the installed app's name
 * follows the brand. Only the staff app links it (the guest page isn't an app to install).
 */
const preview = process.env.PREVIEW === "1";
const build = process.env.NEXT_PUBLIC_BUILD || new Date().toISOString().replace(/\D/g, "").slice(0, 14);
process.env.NEXT_PUBLIC_BUILD = build;
try {
  mkdirSync("public", { recursive: true });
  writeFileSync("public/version.json", JSON.stringify({ build }) + "\n");
  writeFileSync("public/manifest.webmanifest", JSON.stringify({
    name: BRAND.name, short_name: BRAND.name, description: "Restaurant POS, kitchen and floor",
    id: "./", start_url: "./", scope: "./", display: "standalone", orientation: "any",
    background_color: "#0f1218", theme_color: "#171b24", categories: ["business", "food"],
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "POS", url: "./#/pos", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
      { name: "Kitchen", url: "./#/kitchen", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
      { name: "Floor", url: "./#/floor", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
    ],
  }, null, 1) + "\n");
} catch { /* read-only checkout: the update bar simply stays quiet */ }

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
  env: { NEXT_PUBLIC_BUILD: build },
  ...(preview ? { assetPrefix: "." } : {}),
};

export default nextConfig;
