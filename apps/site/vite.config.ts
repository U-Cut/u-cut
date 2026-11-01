import { defineConfig } from "vite";

// Link previews need a full address, which Vercel provides when it builds the site.
const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site = host ? `https://${host}` : "";

export default defineConfig({
  resolve: {
    conditions: ["source"],
    // The player comes from apps/web, which isn't installed when only this site is built.
    dedupe: ["@u-cut/compose", "@u-cut/schema"],
  },
  plugins: [
    {
      name: "site-address",
      transformIndexHtml: (html) => html.replaceAll("%SITE%", site),
    },
  ],
});
