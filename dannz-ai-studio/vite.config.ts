import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Proxy for the local Python API (`npm run api`).
 *
 * When the API is not running we answer 503 - not Vite's default 500 - so the
 * client can tell "API offline" (fall back to a direct browser fetch) apart
 * from "the API refused this URL" (surface the API's own reason).
 */
function apiProxy() {
  return {
    "/api": {
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
      configure: (proxy: {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
      }) => {
        proxy.on("error", (_err: unknown, _req: unknown, res: unknown) => {
          const response = res as {
            writeHead?: (
              status: number,
              headers: Record<string, string>,
            ) => void;
            end?: (body?: string) => void;
          };
          if (response.writeHead && response.end) {
            response.writeHead(503, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ detail: "api offline" }));
          }
        });
      },
    },
  };
}

/**
 * No path aliases: every source module imports relatively, so the config stays
 * dependency-free (no @types/node needed for the typecheck).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // Local Python API (`npm run api`) so /api behaves identically in dev and prod.
    proxy: apiProxy(),
  },
  preview: {
    port: 4173,
    host: true,
    // `npm run preview` serves the production build but can still talk to
    // the local Python API for a full-fidelity smoke test.
    proxy: apiProxy(),
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          fabric: ["fabric"],
        },
      },
    },
  },
});
