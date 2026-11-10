import type { NextConfig } from "next";

/**
 * DineOS web app. Built into plain files (like Studio CRM) and served by Cloudflare.
 * PREVIEW=1 builds the design prototype with relative asset paths so it can be opened
 * from any folder (used for the review link); normal builds use absolute paths.
 */
const preview = process.env.PREVIEW === "1";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
  ...(preview ? { assetPrefix: "." } : {}),
};

export default nextConfig;
