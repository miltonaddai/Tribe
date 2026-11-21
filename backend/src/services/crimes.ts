/**
 * Reading and writing the station blotter.
 *
 * Stored in the local sandbox database, so reports survive a restart.
 */

import {
  cleanText,
  isOffenceId,
  REPORT_COOLDOWN_MS,
  REPORT_MAX_PER_WINDOW,
  REPORT_NOTE_MAX,
  REPORT_WINDOW_MS,
  type CrimeReport,
  type OffenceId,
  type WalletChainId,
} from "@tribe/shared";
import { getDb } from "./localDb";

export type ReportDraft = {
  city: string;
  offence: string;
  accusedName: string;
  note: string;
  reporterWallet: string;
  reporterChain: WalletChainId;
  reporterName: string;
};

export type FileResult = { ok: true; report: CrimeReport } | { ok: false; reason: string };

function windowStart() {
  return new Date(Date.now() - REPORT_WINDOW_MS).toISOString();
}

/**
 * Accepts a report, or says why not.
 *
 * Rate limits are checked against what is actually stored rather than against a
 * counter held in memory, so they survive a restart and cannot be reset by
 * reconnecting.
 */
export async function fileReport(draft: ReportDraft): Promise<FileResult> {
  if (!isOffenceId(draft.offence)) return { ok: false, reason: "Pick an offence." };
  if (!draft.reporterWallet) return { ok: false, reason: "Join the world to file a report." };

  const offence = draft.offence as OffenceId;
  const note = cleanText(draft.note ?? "", REPORT_NOTE_MAX);
  // Reuses the player-name cap: an accused is a name, and anything longer than
  // a name could never have belonged to one.
  const accusedName = cleanText(draft.accusedName ?? "", 16);

  const db = getDb();
  const now = Date.now();

  const { data: recent, error: recentError } = await db
    .from("crime_reports")
    .select("created_at")
    .eq("reporter_wallet", draft.reporterWallet)
    .eq("reporter_chain", draft.reporterChain)
    .gte("created_at", windowStart())
    .order("created_at", { ascending: false });
  if (recentError) {
    console.error("[crimes] rate check", recentError.message);
    return { ok: false, reason: "Could not reach the station. Try again." };
  }
  const limited = checkLimits((recent ?? []).map((r) => Date.parse(r.created_at)), now);
  if (limited) return { ok: false, reason: limited };

  const { data, error } = await db
    .from("crime_reports")
    .insert({
      city: draft.city,
      offence,
      reporter_wallet: draft.reporterWallet,
      reporter_chain: draft.reporterChain,
      reporter_name: draft.reporterName,
      accused_name: accusedName,
      note,
    })
    .select("id,created_at")
    .single();
  if (error || !data) {
    console.error("[crimes] file", error?.message);
    return { ok: false, reason: "Could not file that report." };
  }

  return {
    ok: true,
    report: {
      id: String(data.id),
      city: draft.city,
      offence,
      reporterName: draft.reporterName,
      accusedName,
      note,
      at: Date.parse(data.created_at),
    },
  };
}

/** Null when the player may file, otherwise why they may not. */
function checkLimits(times: number[], now: number): string | null {
  const newest = times.length > 0 ? Math.max(...times) : 0;
  if (newest && now - newest < REPORT_COOLDOWN_MS) {
    const wait = Math.ceil((REPORT_COOLDOWN_MS - (now - newest)) / 1000);
    return `The desk is still writing up your last one. ${wait}s.`;
  }
  if (times.length >= REPORT_MAX_PER_WINDOW) {
    return "You have filed too many reports recently.";
  }
  return null;
}

/** The last 72 hours for one city, newest first. */
export async function recentReports(city: string): Promise<CrimeReport[]> {
  const db = getDb();

  const { data, error } = await db
    .from("crime_reports")
    .select("id,city,offence,reporter_name,accused_name,note,created_at")
    .eq("city", city)
    .gte("created_at", windowStart())
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) {
    console.error("[crimes] list", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    city: String(row.city),
    offence: row.offence as OffenceId,
    reporterName: String(row.reporter_name ?? "citizen"),
    accusedName: String(row.accused_name ?? ""),
    note: String(row.note ?? ""),
    at: Date.parse(row.created_at),
  }));
}
