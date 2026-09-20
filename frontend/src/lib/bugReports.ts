/**
 * Bug reports, written straight to Firestore from the browser.
 *
 * The SDK is imported dynamically rather than at module scope. Firebase is
 * several hundred kilobytes and all but a handful of players will never open
 * the form, so it has no business in the bundle everyone downloads to walk
 * around a city. Nothing here runs until someone actually reports something.
 *
 * The config is not a secret - a Firebase web config identifies the project
 * and is visible in any client that talks to it - but it lives in env vars
 * anyway, so a fork or a second project is a deploy setting rather than an
 * edit. Left unset, reporting reports itself as unavailable instead of
 * failing silently at submit time.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const COLLECTION = "bug_reports";

/** The longest report we will send. Firestore's own limit is far higher. */
export const REPORT_MAX = 2000;

export function reportingConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
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

let ready: Promise<{ db: unknown; add: typeof import("firebase/firestore").addDoc; col: typeof import("firebase/firestore").collection }> | null = null;

function connect() {
  ready ??= (async () => {
    const [{ initializeApp, getApps }, firestore] = await Promise.all([
      import("firebase/app"),
      import("firebase/firestore"),
    ]);
    // getApps() first: React strict mode mounts twice in development, and
    // initializing the same project twice throws.
    const app = getApps()[0] ?? initializeApp(config);
    return { db: firestore.getFirestore(app), add: firestore.addDoc, col: firestore.collection };
  })();
  return ready;
}

export async function sendBugReport(report: string, context: BugContext): Promise<{ ok: true } | { ok: false; reason: string }> {
  const text = report.trim();
  if (!text) return { ok: false, reason: "Describe what went wrong first." };
  if (!reportingConfigured()) return { ok: false, reason: "Bug reporting is not configured for this build." };

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
    const { db, add, col } = await connect();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await add(col(db as any, COLLECTION), doc);
    return { ok: true };
  } catch (err) {
    // Almost always the security rules refusing the write, which is worth
    // saying plainly - it is a project setting, not something the player did.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Could not send that: ${message}` };
  }
}
