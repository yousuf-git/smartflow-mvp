import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/smartflow-mark.svg",
      ],
      manifest: {
        name: "SmartFlow",
        short_name: "SmartFlow",
        description: "Smart water conservation system",
        theme_color: "#0F8CB0",
        background_color: "#F6F8F9",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icons/smartflow-mark.svg",
            sizes: "64x64 192x192 512x512",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    allowedHosts: [".ngrok-free.dev"],
  },
});
