/**
 * Where the HTTP API lives.
 *
 * In development this is empty, so requests stay root-relative and Vite's dev
 * proxy forwards /api to the backend on localhost:2567. In production the
 * frontend is static files on a different host entirely, and that proxy does
 * not exist - a root-relative /api/characters would hit the static host and
 * come back as the index page or a 404. Every API call therefore goes through
 * apiUrl(), which prefixes VITE_API_URL when one is set.
 *
 * It is an environment variable rather than a rewrite rule because Netlify does
 * not interpolate environment variables into netlify.toml redirects: a proxy
 * would mean hard-coding the backend host into a committed file, and changing
 * it - or running a second environment - would mean editing and redeploying.
 *
 * The backend serves permissive CORS, so a cross-origin base works as-is. Worth
 * narrowing that to the real frontend domain before this has users.
 */

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** `path` starts with a slash, e.g. apiUrl("/api/token"). */
export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}
