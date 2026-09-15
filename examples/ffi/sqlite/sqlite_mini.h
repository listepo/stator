// sqlite_mini.h — curated SQLite subset for the ffi-gen phase-Check demo binding.
//
// REAL prototypes copied from the SDK header
// (/opt/homebrew/opt/sqlite/include/sqlite3.h); each declaration cites the
// SDK line its parameter list is copied from. `SQLITE_API` expands to empty
// there (sqlite3.h:75-77), so omitting it below changes nothing — what
// remains is the declaration verbatim. Only the 13 demo functions plus the
// two typedefs they need; NOTHING else.
#ifndef SQLITE_MINI_H
#define SQLITE_MINI_H

// sqlite3.h:275
typedef struct sqlite3 sqlite3;
// sqlite3.h:4303
typedef struct sqlite3_stmt sqlite3_stmt;

// sqlite3.h:3990
int sqlite3_open(
  const char *filename,   /* Database filename (UTF-8) */
  sqlite3 **ppDb          /* OUT: SQLite db handle */
);
// sqlite3.h:4602
int sqlite3_prepare_v2(
  sqlite3 *db,            /* Database handle */
  const char *zSql,       /* SQL statement, UTF-8 encoded */
  int nByte,              /* Maximum length of zSql in bytes. */
  sqlite3_stmt **ppStmt,  /* OUT: Statement handle */
  const char **pzTail     /* OUT: Pointer to unused portion of zSql */
);
// sqlite3.h:5312
int sqlite3_step(sqlite3_stmt*);
// sqlite3.h:5582
int sqlite3_column_int(sqlite3_stmt*, int iCol);
// sqlite3.h:5581
double sqlite3_column_double(sqlite3_stmt*, int iCol);
// sqlite3.h:5584
const unsigned char *sqlite3_column_text(sqlite3_stmt*, int iCol);
// sqlite3.h:5013
int sqlite3_bind_int(sqlite3_stmt*, int, int);
// sqlite3.h:5012
int sqlite3_bind_double(sqlite3_stmt*, int, double);
// sqlite3.h:5617
int sqlite3_finalize(sqlite3_stmt *pStmt);
// sqlite3.h:356
int sqlite3_close(sqlite3*);
// sqlite3.h:4246
const char *sqlite3_errmsg(sqlite3*);
// sqlite3.h:191
int sqlite3_libversion_number(void);
// sqlite3.h:2870
int sqlite3_changes(sqlite3*);

#endif
