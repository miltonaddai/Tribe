/**
 * Reading and writing the station blotter.
 *
 * Falls back to an in-process list when no database is configured, so the
 * feature still works in local development. The fallback is explicitly not a
 * cache: it is only consulted when there is no Supabase at all, because a board
 * that silently served stale rows after a database hiccup would be worse than
 * one that came back empty.
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
import { getSupabase } from "./supabase";

/** Reports are short-lived and few; a plain array is ample without a database. */
const memory: (CrimeReport & { reporterWallet: string })[] = [];

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
  if (!draft.reporterWallet) return { ok: false, reason: "Connect a wallet to file a report." };

  const offence = draft.offence as OffenceId;
  const note = cleanText(draft.note ?? "", REPORT_NOTE_MAX);
  // Reuses the player-name cap: an accused is a name, and anything longer than
  // a name could never have belonged to one.
  const accusedName = cleanText(draft.accusedName ?? "", 16);

  const supabase = getSupabase();
  const now = Date.now();

  if (!supabase) {
    const mine = memory.filter(
      (r) => r.reporterWallet === draft.reporterWallet && now - r.at < REPORT_WINDOW_MS,
    );
    const limited = checkLimits(mine.map((r) => r.at), now);
    if (limited) return { ok: false, reason: limited };
    const report: CrimeReport = {
      id: `local-${now}-${memory.length}`,
      city: draft.city,
      offence,
      reporterName: draft.reporterName,
      accusedName,
      note,
      at: now,
    };
    memory.unshift({ ...report, reporterWallet: draft.reporterWallet });
    // Unbounded growth is the only real risk in a process that never restarts.
    if (memory.length > 500) memory.length = 500;
    return { ok: true, report };
  }

  const { data: recent, error: recentError } = await supabase
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

  const { data, error } = await supabase
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
  const supabase = getSupabase();
  if (!supabase) {
    const cutoff = Date.now() - REPORT_WINDOW_MS;
    return memory
      .filter((r) => r.city === city && r.at >= cutoff)
      .map(({ reporterWallet: _ignored, ...report }) => report);
  }

  const { data, error } = await supabase
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
