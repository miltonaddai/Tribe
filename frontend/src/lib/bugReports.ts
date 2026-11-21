/**
 * Bug reports, saved by the local game server into its sandbox database
 * (backend/data/sandbox-db.json, table "bug_reports"). Nothing leaves the
 * machine.
 */

import { apiUrl } from "./api";

/** The longest report we will send. */
export const REPORT_MAX = 2000;

export function reportingConfigured(): boolean {
  return true;
}

/** What the player was doing when it happened, gathered rather than asked for. */
export type BugContext = {
  wallet?: string;
  name?: string;
  city?: string;
  x?: number;
  z?: number;
  /** The HUD's own location label - district, street or building. */
  block?: string;
  health?: number;
};

type Doc = BugContext & {
  report: string;
  at: string;
  url: string;
  userAgent: string;
  screen: string;
  renderer: string;
};

/**
 * The GPU string, which is the first thing worth knowing about a rendering
 * bug and the one thing a reporter will never think to include.
 */
function renderer(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!gl) return "no webgl2";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "masked";
    return `${name} · depth ${gl.getParameter(gl.DEPTH_BITS)}-bit`;
  } catch {
    return "unknown";
  }
}

export async function sendBugReport(report: string, context: BugContext): Promise<{ ok: true } | { ok: false; reason: string }> {
  const text = report.trim();
  if (!text) return { ok: false, reason: "Describe what went wrong first." };

  const doc: Doc = {
    ...context,
    report: text.slice(0, REPORT_MAX),
    at: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
    renderer: renderer(),
  };

  try {
    const res = await fetch(apiUrl("/api/bug-reports"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
    if (!res.ok) return { ok: false, reason: `Could not save that (${res.status}).` };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Could not reach the local game server: ${message}` };
  }
}
