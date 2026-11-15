import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import type { Plugin } from "vite"

// em desenvolvimento o React injeta um script inline (recarga rápida); no build a política continua estrita
const devCsp = (): Plugin => ({
  name: "aureon-dev-csp",
  apply: "serve",
  transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
})

// três páginas: app principal, notch (uma janela por monitor) e camada de widgets (uma por monitor)
export default defineConfig({
  base: "./",
  plugins: [react(), devCsp()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 5173, strictPort: true },
  build: {
    target: "chrome130",
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "index.html"),
        notch: path.resolve(__dirname, "notch.html"),
        widgets: path.resolve(__dirname, "widgets.html"),
      },
    },
  },
})
