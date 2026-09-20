import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // The manifest itself: apps/web/public/manifest.webmanifest is
      // hand-written (index.html links it directly) rather than generated
      // here, so Safari/iOS -- which reads the <link rel="manifest"> tag
      // regardless of this plugin -- and Chrome see exactly the same file.
      manifest: false,
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,ico}"] },
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      devOptions: { enabled: false }, // dev already runs against wrangler's own server, not this
    }),
  ],
  server: {
    // Local dev talks to the Worker running its own local server
    // (apps/api, wrangler dev on 8787) rather than trying to run the API
    // inside Vite -- same split as production, just both processes on one
    // machine.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
