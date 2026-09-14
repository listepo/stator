// Shared declaration for the subset_extern_link_noextern_* decision fixtures (docs/FFI.md
// section 9): a pragma in a file with no extern declaration. Flags belong to the binding
// they link, so the gate refuses the stray line rather than linking — or dropping — it.

// @statorLink: -lsqlite3

/** An ordinary ambient declaration, not an extern call. */
declare function extF(): number;
