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

/**
 * Fetches JSON from the API and fails in a way that names the real problem.
 *
 * The failure this exists for: with VITE_API_URL unset, an /api call stays
 * root-relative, hits the static host, is caught by the SPA catch-all rewrite,
 * and comes back as index.html with a 200. `res.json()` then throws
 * `Unexpected token '<', "<!doctype "... is not valid JSON`, which points at
 * the parser rather than at the missing configuration - and looks to a player
 * like the wallet is broken.
 *
 * So the content type is checked before parsing, and an HTML body is reported
 * as what it is.
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), init);
  } catch {
    throw new Error(`Cannot reach the game server at ${BASE || window.location.origin}.`);
  }
  assertJson(res);
  return (await res.json()) as T;
}

/**
 * Throws unless the response is actually JSON.
 *
 * Separate from apiJson so a caller that needs the status code - sign-in reads
 * it to tell "rejected" from "unreachable" - can still get this check without
 * giving up its own handling.
 */
export function assertJson(res: Response) {
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("json")) return;
  // A 200 of HTML means the request never left the static host.
  throw new Error(
    BASE
      ? `The game server at ${BASE} did not return JSON (${res.status}).`
      : "The game server is not configured. VITE_API_URL is unset, so API requests are hitting the website instead of the backend.",
  );
}

/**
 * `Authorization` for API calls that act on the signed-in player.
 *
 * Read straight from storage rather than through session.ts, so the modules
 * that persist characters and settings do not import the session module that
 * imports them.
 */
export function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem("moonville:session");
    const token = raw ? (JSON.parse(raw) as { token?: string }).token : "";
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
