import type { NextConfig } from "next";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * DineOS web app. Built into plain files (like Studio CRM) and served by Cloudflare.
 * Pages: index.html (staff app, hash routes) and t.html?k=<QR token> (guest page).
 * PREVIEW=1 uses relative asset paths so the build can be opened from any folder (review
 * links); normal builds use absolute paths.
 * Every build gets a stamp; the app compares it with public/version.json to offer "Refresh now".
 */
const preview = process.env.PREVIEW === "1";
const build = process.env.NEXT_PUBLIC_BUILD || new Date().toISOString().replace(/\D/g, "").slice(0, 14);
process.env.NEXT_PUBLIC_BUILD = build;
mkdirSync("public", { recursive: true });
writeFileSync("public/version.json", JSON.stringify({ build }) + "\n");

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
  env: { NEXT_PUBLIC_BUILD: build },
  ...(preview ? { assetPrefix: "." } : {}),
};

export default nextConfig;
