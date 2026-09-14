// Shared declaration for the subset_extern_link_bad_* decision fixtures (docs/FFI.md
// section 9): a binding whose header pragma is malformed — the header arrives unquoted, so
// the gate refuses the LINE rather than guessing which header was meant.

// @statorLink #include sqlite3.h

/** @statorExtern */
declare function extF(): number;
