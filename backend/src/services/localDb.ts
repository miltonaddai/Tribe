import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The sandbox database: plain tables of JSON rows, kept in memory and written
 * to one file on disk. No network, no server, nothing to install.
 *
 * It exposes the small slice of a PostgREST-style query builder the services
 * use - from/select/eq/gte/or/order/limit/single/maybeSingle and
 * insert/upsert/update/delete - so game logic reads the same as it would over
 * a real database. Unique constraints are enforced and reported with the
 * Postgres code "23505", which is what callers check for.
 *
 * File: backend/data/sandbox-db.json, or SANDBOX_DB_FILE. Set SANDBOX_DB_FILE
 * to "memory" to keep nothing between restarts. Delete the file to reset the
 * world.
 */

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = Record<string, any>;
export type DbError = { message: string; code?: string };
export type DbResult<T> = { data: T; error: DbError | null };

type TableSpec = {
  /** Each entry is a set of columns that must be unique together. The first is the primary key. */
  unique: string[][];
  /** Filled with a random uuid on insert when missing. */
  uuidId?: boolean;
};

const TABLES: Record<string, TableSpec> = {
  accounts: { unique: [["id"], ["username_key"]], uuidId: true },
  wallets: { unique: [["id"], ["address", "chain"]], uuidId: true },
  characters: { unique: [["id"], ["wallet_address", "chain"], ["display_name_key"]], uuidId: true },
  player_settings: { unique: [["wallet_address", "chain"]] },
  presence: { unique: [["session_id"]] },
  home_auctions: { unique: [["home_id"]] },
  player_messages: { unique: [["id"]], uuidId: true },
  player_vehicles: { unique: [["id"]] },
  friendships: {
    unique: [["id"], ["requester_wallet", "requester_chain", "addressee_wallet", "addressee_chain"]],
    uuidId: true,
  },
  crime_reports: { unique: [["id"]], uuidId: true },
  bug_reports: { unique: [["id"]], uuidId: true },
};

const DEFAULT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/sandbox-db.json");

function dbFile(): string | null {
  const raw = (process.env.SANDBOX_DB_FILE ?? "").trim();
  if (raw === "memory") return null;
  return raw ? path.resolve(raw) : DEFAULT_FILE;
}

class Store {
  private tables = new Map<string, Row[]>();
  private file = dbFile();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    if (this.file && fs.existsSync(this.file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Record<string, Row[]>;
        for (const [name, rows] of Object.entries(parsed)) {
          if (Array.isArray(rows)) this.tables.set(name, rows);
        }
        console.log(`[sandbox-db] loaded ${this.file}`);
        this.migrate();
      } catch (error) {
        console.warn(`[sandbox-db] could not read ${this.file}, starting empty`, error);
      }
    } else {
      console.log(`[sandbox-db] ${this.file ? `new database at ${this.file}` : "in-memory only"}`);
    }
    // Flush pending writes on a clean shutdown so the last moves are kept.
    const flush = () => this.flush();
    process.once("beforeExit", flush);
    process.once("SIGINT", () => {
      flush();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      flush();
      process.exit(0);
    });
  }

  /**
   * Upgrades a database written by an older build. The balance column was
   * `moon` and the currency symbol "MOON" under the game's old name, Moonville.
   */
  private migrate() {
    let changed = false;
    for (const row of this.tables.get("characters") ?? []) {
      if ("moon" in row && !("bucks" in row)) {
        row.bucks = row.moon;
        delete row.moon;
        changed = true;
      }
    }
    for (const row of this.tables.get("wallets") ?? []) {
      if (row.symbol === "MOON") {
        row.symbol = "BUCKS";
        changed = true;
      }
    }
    if (changed) {
      console.log("[sandbox-db] migrated balances from moon to bucks");
      this.changed();
    }
  }

  rows(table: string): Row[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  spec(table: string): TableSpec {
    return TABLES[table] ?? { unique: [] };
  }

  /** Debounced: a burst of writes costs one disk write. */
  changed() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 250);
  }

  flush() {
    if (!this.file) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.tables), null, 1));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.warn("[sandbox-db] save failed", error);
    }
  }
}

type Filter = (row: Row) => boolean;
type Action = "select" | "insert" | "upsert" | "update" | "delete";

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "number" && Number.isFinite(Number(b))) return a - Number(b);
  // ISO timestamps and ids compare correctly as plain ordinal strings.
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function same(a: unknown, b: unknown) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Splits on commas that are not inside parentheses. */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** PostgREST filter syntax, as much of it as the services use: `col.eq.v`, `and(...)`, `or(...)`. */
function parseCondition(text: string): Filter {
  const group = /^(and|or)\((.*)\)$/.exec(text);
  if (group) {
    const inner = splitTop(group[2]).map(parseCondition);
    return group[1] === "and" ? (row) => inner.every((f) => f(row)) : (row) => inner.some((f) => f(row));
  }
  const [column, op, ...rest] = text.split(".");
  const value = rest.join(".");
  switch (op) {
    case "eq":
      return (row) => same(row[column], value);
    case "neq":
      return (row) => !same(row[column], value);
    case "gte":
      return (row) => compare(row[column], value) >= 0;
    case "lte":
      return (row) => compare(row[column], value) <= 0;
    default:
      throw new Error(`[sandbox-db] unsupported filter: ${text}`);
  }
}

class Query<T = DbRow[]> implements PromiseLike<DbResult<T>> {
  private action: Action = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private conflict: string[] | null = null;
  private filters: Filter[] = [];
  private columns: string[] | null = null;
  private returning = false;
  private sort: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private one: "single" | "maybe" | null = null;

  constructor(
    private store: Store,
    private table: string,
  ) {}

  // --- verbs ----------------------------------------------------------------

  select(columns = "*") {
    if (this.action !== "select") this.returning = true;
    this.columns = columns.trim() === "*" ? null : columns.split(",").map((c) => c.trim());
    return this;
  }

  insert(rows: Row | Row[]) {
    this.action = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.action = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = opts?.onConflict ? opts.onConflict.split(",").map((c) => c.trim()) : null;
    return this;
  }

  update(patch: Row) {
    this.action = "update";
    this.patch = patch;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  // --- filters and shaping --------------------------------------------------

  eq(column: string, value: unknown) {
    this.filters.push((row) => same(row[column], value));
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push((row) => compare(row[column], value) >= 0);
    return this;
  }

  or(expression: string) {
    const parts = splitTop(expression).map(parseCondition);
    this.filters.push((row) => parts.some((f) => f(row)));
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.sort = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number) {
    this.max = n;
    return this;
  }

  single(): Query<DbRow | null> {
    this.one = "single";
    return this as unknown as Query<DbRow | null>;
  }

  maybeSingle(): Query<DbRow | null> {
    this.one = "maybe";
    return this as unknown as Query<DbRow | null>;
  }

  // --- execution ------------------------------------------------------------

  then<A = DbResult<T>, B = never>(
    onfulfilled?: ((value: DbResult<T>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every((f) => f(row));
  }

  private violation(rows: Row[], candidate: Row, ignore: Row | null): DbError | null {
    for (const cols of this.store.spec(this.table).unique) {
      if (cols.some((c) => candidate[c] == null)) continue;
      const clash = rows.find((r) => r !== ignore && cols.every((c) => same(r[c], candidate[c])));
      if (clash) {
        return {
          code: "23505",
          message: `duplicate key value violates unique constraint "${this.table}_${cols.join("_")}"`,
        };
      }
    }
    return null;
  }

  private withDefaults(row: Row): Row {
    const out: Row = { ...row };
    if (this.store.spec(this.table).uuidId && out.id == null) out.id = randomUUID();
    if (out.created_at == null) out.created_at = new Date().toISOString();
    return out;
  }

  private shape(rows: Row[]): DbResult<T> {
    let out = rows.map((r) => structuredClone(r));
    if (this.sort) {
      const { column, ascending } = this.sort;
      out.sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
    }
    if (this.max != null) out = out.slice(0, this.max);
    if (this.columns) {
      const cols = this.columns;
      out = out.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
    }
    if (this.one) {
      if (out.length > 1) return { data: null as T, error: { message: "multiple rows returned", code: "PGRST116" } };
      if (out.length === 0) {
        return this.one === "single"
          ? { data: null as T, error: { message: "no rows returned", code: "PGRST116" } }
          : { data: null as T, error: null };
      }
      return { data: out[0] as T, error: null };
    }
    return { data: out as T, error: null };
  }

  private run(): DbResult<T> {
    const rows = this.store.rows(this.table);
    switch (this.action) {
      case "select":
        return this.shape(rows.filter((r) => this.matches(r)));

      case "insert": {
        const added: Row[] = [];
        for (const raw of this.payload) {
          const row = this.withDefaults(raw);
          const error = this.violation([...rows, ...added], row, null);
          if (error) return { data: null as T, error };
          added.push(row);
        }
        rows.push(...added);
        this.store.changed();
        return this.returning ? this.shape(added) : { data: null as T, error: null };
      }

      case "upsert": {
        const keys = this.conflict ?? this.store.spec(this.table).unique[0] ?? ["id"];
        const touched: Row[] = [];
        for (const raw of this.payload) {
          const existing = rows.find((r) => keys.every((k) => same(r[k], raw[k])));
          if (existing) {
            const merged = { ...existing, ...raw };
            const error = this.violation(rows, merged, existing);
            if (error) return { data: null as T, error };
            Object.assign(existing, raw);
            touched.push(existing);
          } else {
            const row = this.withDefaults(raw);
            const error = this.violation(rows, row, null);
            if (error) return { data: null as T, error };
            rows.push(row);
            touched.push(row);
          }
        }
        this.store.changed();
        return this.returning ? this.shape(touched) : { data: null as T, error: null };
      }

      case "update": {
        const hit = rows.filter((r) => this.matches(r));
        for (const row of hit) {
          const error = this.violation(rows, { ...row, ...this.patch }, row);
          if (error) return { data: null as T, error };
        }
        for (const row of hit) Object.assign(row, this.patch);
        if (hit.length) this.store.changed();
        return this.returning ? this.shape(hit) : { data: null as T, error: null };
      }

      case "delete": {
        const kept = rows.filter((r) => !this.matches(r));
        const removed = rows.filter((r) => this.matches(r));
        if (removed.length) {
          rows.length = 0;
          rows.push(...kept);
          this.store.changed();
        }
        return this.returning ? this.shape(removed) : { data: null as T, error: null };
      }
    }
  }
}

export type LocalDb = {
  from: (table: string) => Query;
};

let store: Store | null = null;

/** The sandbox database. Always available - there is nothing to configure. */
export function getDb(): LocalDb {
  if (!store) store = new Store();
  const s = store;
  return { from: (table: string) => new Query(s, table) };
}
