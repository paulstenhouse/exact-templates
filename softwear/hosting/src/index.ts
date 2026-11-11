import { demoDenied } from "./demo-policy";
import { resetDemo } from "./demo-reset";
import { env } from "cloudflare:workers";
import { routes } from "../../.deploy/app/target/web-dist/routes.json";

const api = ["/api", "/auth", "/storage", "/health", "/cms", "/openapi.json", "/asyncapi.json", "/schema-registry.json", "/.well-known"];
const routePatterns = routes.filter((route) => !route.notfound).map((route) =>
  new RegExp("^" + route.pattern.split("/").map((part) => part.startsWith(":") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/") + "/?$")
);

function assetRequest(request: Request, path: string): Request {
  const url = new URL(request.url);
  url.pathname = path;
  const headers = new Headers(request.headers);
  headers.delete("if-none-match");
  headers.delete("if-modified-since");
  return new Request(url, { method: request.method, headers });
}

export default {
  async scheduled() {
    await resetDemo(env.DEMO_DB, env.DEMO_AUTH);
  },
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (demoDenied(path, request.method)) return Response.json({ code: "DEMO_RESTRICTED", detail: "Use the shared demo logins. Account administration and credential changes are disabled." }, { status: 403 });
    if (path.startsWith("/account/")) return env.BACKEND.fetch(request);
    if (api.some((prefix) => path === prefix || path.startsWith(prefix + "/"))) return env.BACKEND.fetch(request);
    const direct = await env.ASSETS.fetch(request);
    if (direct.status !== 404 || !["GET", "HEAD"].includes(request.method)) return direct;
    const index = await env.ASSETS.fetch(assetRequest(request, path.replace(/\/$/, "") + "/index.html"));
    if (index.status !== 404) return index;
    if (routePatterns.some((pattern) => pattern.test(path))) {
      const shell = await env.ASSETS.fetch(assetRequest(request, "/shell.html"));
      const headers = new Headers(shell.headers);
      headers.set("cache-control", "no-cache");
      return new Response(shell.body, { status: shell.status, headers });
    }
    const missing = await env.ASSETS.fetch(assetRequest(request, "/404.html"));
    return new Response(missing.body, { status: 404, headers: missing.headers });
  },
} satisfies ExportedHandler;
