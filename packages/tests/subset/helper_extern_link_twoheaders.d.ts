// Shared declarations for the subset_extern_link_twoheaders_* decision fixtures
// (docs/FFI.md section 9): a binding file naming two headers. One binding file wraps one
// library, so the second header names a second binding the file does not contain — refused
// where it is written.

// @statorLink #include <a.h>
// @statorLink #include <b.h>

/** @statorExtern */
declare function extF(): number;
