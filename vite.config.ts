import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import flowCss from "@flow-css/vite";
import theme from "./src/client/theme.js";

export default defineConfig({
  plugins: [react(), flowCss({ theme })],
  root: ".",
  build: {
    outDir: "dist/client",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/auth": "http://localhost:3001",
    },
  },
});
