// demo.ts — the runnable SQLite demo (FFI track, phase-Check program).
//
// Canonical program: open `:memory:`, create and fill `t(id, v)`, select the
// rows back. `stator build` on this file must produce a runnable binary (see
// sqlite-demo.ts); `-lsqlite3` arrives via the generated binding's
// `@statorLink` pragma, never here.
//
// Assumed `sqlite.gen.d.ts` shape (parallel track; C parameter order, error
// codes as `number`): open/prepare take an out-slot for the `T**` handle,
// prepare additionally takes nByte and a tail out-slot; step/column readers
// are plain values. Binds/finalize/close carry `@statorError nonzero`; open
// and prepare do NOT yet (generator TODOs), so this file checks those two
// return codes by hand — the checks go unreachable, not wrong, once tagged.

// oxlint-disable-next-line typescript/triple-slash-reference -- STA1121 keeps extern bindings in a .d.ts; import style cannot carry the ambient extern declaration (bench/programs/ffi-sqrt.ts spelling).
/// <reference path="./sqlite.gen.d.ts" />
// oxlint-disable-next-line typescript/triple-slash-reference -- same as above: slot.d.ts carries the ambient outSlot declare.
/// <reference path="./slot.d.ts" />

// Handle and text spellings, taken from the binding — never redeclared.
type Db = Ptr_sqlite3;
type Stmt = Ptr_sqlite3_stmt;
type SqlText = CString;
type TailText = CString;

// SQLITE_ROW / SQLITE_DONE; macros have no spelling, so literals (NOTES.md).
const ROW = 100;
const DONE = 101;

// Prepare one statement; the tail slot must come back empty (single input).
function prepare(db: Db, sql: SqlText): Stmt {
  const stmtSlot = outSlot<Stmt>();
  const tailSlot = outSlot<TailText>();
  // Manual nonzero check: the binding carries no `@statorError` tag on
  // prepare yet (sqlite.gen.d.ts TODOs), so a failed prepare returns — not
  // throws — until the audit adds the convention. Once it lands, nonzero
  // never returns and this check is unreachable but harmless.
  const rc = sqlite3PrepareV2(db, sql, -1, stmtSlot, tailSlot);
  if (rc !== 0) {
    throw new Error(`prepare failed with code ${rc}`);
  }
  if (tailSlot.value !== '') {
    throw new Error(`unexpected SQL tail: ${tailSlot.value}`);
  }
  return stmtSlot.value;
}

// Step a statement that returns no rows; finalize on every path. Both return codes
// are checked by hand (same pending-convention note as `prepare`): a failed step throws
// before the finalize, a failed finalize throws after it.
function execOnce(stmt: Stmt, what: string): void {
  const rc = sqlite3Step(stmt);
  const frc = sqlite3Finalize(stmt);
  if (rc !== DONE) {
    throw new Error(`${what} failed with code ${rc}`);
  }
  if (frc !== 0) {
    throw new Error(`${what} finalize failed with code ${frc}`);
  }
}

function insertRow(db: Db, id: number, v: number): void {
  const stmt = prepare(db, 'INSERT INTO t(id, v) VALUES (?, ?)' as SqlText);
  const brc = sqlite3BindInt(stmt, 1, id);
  if (brc !== 0) {
    throw new Error(`bind int failed with code ${brc}`);
  }
  const drc = sqlite3BindDouble(stmt, 2, v);
  if (drc !== 0) {
    throw new Error(`bind double failed with code ${drc}`);
  }
  execOnce(stmt, 'insert');
}

// Open a fresh `:memory:` database via an out-slot; throws on any error
// (same pending-convention note as `prepare`: manual check until tagged).
function openMemory(): Db {
  const dbSlot = outSlot<Db>();
  const rc = sqlite3Open(':memory:' as SqlText, dbSlot);
  if (rc !== 0) {
    throw new Error(`open failed with code ${rc}`);
  }
  return dbSlot.value;
}

export function runDemo(): number {
  const db: Db = openMemory();
  execOnce(prepare(db, 'CREATE TABLE t(id INTEGER, v REAL)' as SqlText), 'create table');
  insertRow(db, 1, 1.5);
  insertRow(db, 2, 2.5);
  const query = prepare(db, "SELECT id, v, 'hi' FROM t ORDER BY id" as SqlText);
  let count = 0;
  for (;;) {
    const rc = sqlite3Step(query);
    if (rc === DONE) {
      break;
    }
    if (rc !== ROW) {
      throw new Error(`select step failed with code ${rc}`);
    }
    const id = sqlite3ColumnInt(query, 0);
    const v = sqlite3ColumnDouble(query, 1);
    const text = sqlite3ColumnText(query, 2);
    console.log(`${id}|${v}|${text}`);
    count += 1;
  }
  const frc = sqlite3Finalize(query);
  if (frc !== 0) {
    throw new Error(`select finalize failed with code ${frc}`);
  }
  const crc = sqlite3Close(db);
  if (crc !== 0) {
    throw new Error(`close failed with code ${crc}`);
  }
  return count;
}

// Error-path proof: preparing bad SQL throws — through the nonzero
// convention once the binding tags prepare (sqlite.gen.d.ts TODO), through
// `prepare()`'s manual check until then — so the trailing close and
// `return 0` never run in either world.
export function runBadSql(): number {
  const db: Db = openMemory();
  prepare(db, 'SELECT nope FROM nope' as SqlText);
  sqlite3Close(db);
  return 0;
}

runDemo();
