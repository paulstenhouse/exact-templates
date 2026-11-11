import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  publicDir: fileURLToPath(new URL("../.deploy/app/target/web-dist", import.meta.url)),
  build: { rollupOptions: { input: fileURLToPath(new URL("./src/static-entry.ts", import.meta.url)) } },
  plugins: [cloudflare()],
});
