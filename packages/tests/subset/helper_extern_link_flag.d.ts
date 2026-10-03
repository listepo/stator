// Shared declaration for the subset_extern_link_flag_* decision fixtures (docs/FFI.md
// section 9): a binding whose pragma carries a flag outside the link allowlist. Any .d.ts in
// the program can carry a pragma, a dependency's included, so `-fplugin=` here would load code
// into clang at build time; the gate refuses the LINE and the user's --link= stays the hatch.

// @statorLink: -lfoo -fplugin=/tmp/evil.so

/** @statorExtern */
declare function extF(): number;
