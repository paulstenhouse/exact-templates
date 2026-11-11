const authReads = new Set(['/auth/v1/get-session']);
const authWrites = new Set(['/auth/v1/sign-in/email', '/auth/v1/sign-out']);

// This gateway is the backend's only public ingress. The generated backend is
// deployed with workers.dev and preview URLs disabled, reached by service binding.
export function demoDenied(path: string, method: string): boolean {
  // Reject encoded path aliases before forwarding to another router.
  if (path.includes('%') || path.includes('//') || path.includes('\\')) return true;
  if (path === '/auth' || path.startsWith('/auth/')) {
    return !((method === 'GET' && authReads.has(path)) || (method === 'POST' && authWrites.has(path)));
  }
  if (method === 'GET' && path === '/api/v1/operator/organizations') return false;
  // Public demo staff manage shop records, never identities or credentials.
  if (/^\/api\/(v1|v2)\/(operator|organization|apikey|api-key|webhooks|push)(\/|$)/.test(path)) return true;
  return false;
}
