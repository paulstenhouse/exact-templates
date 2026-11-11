import { bindings, defineConfig, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "softwear-flagship",
    compatibilityDate: "2026-11-11",
    entrypoint,
    triggers: [triggers.scheduled({ schedule: "*/30 * * * *" })],
    domains: ["softwear.examples.quickback.dev"],
    assets: { htmlHandling: "none", notFoundHandling: "none", runWorkerFirst: true },
    env: {
      DEMO_DB: bindings.d1({ id: "5cfbe925-33b1-45ef-8382-f147687aa37b", name: "softwear-features" }),
      DEMO_AUTH: bindings.d1({ id: "0b9cb069-db7b-4341-b5b8-2c1542c308bf", name: "softwear-auth" }),
      ASSETS: bindings.assets(),
      BACKEND: bindings.worker({ worker: "softwear" }),
    },
    observability: { enabled: true, traces: { enabled: true, headSamplingRate: 0.1 } },
  },
});
