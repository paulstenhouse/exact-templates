import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "softwear-flagship",
    compatibilityDate: "2026-11-11",
    entrypoint,
    domains: ["softwear.examples.quickback.dev"],
    assets: { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: true },
    env: {
      ASSETS: bindings.assets(),
      BACKEND: bindings.worker({ worker: "softwear" }),
    },
    observability: { enabled: true, traces: { enabled: true, headSamplingRate: 0.1 } },
  },
});
