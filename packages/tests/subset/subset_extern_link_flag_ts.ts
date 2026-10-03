// @mode: ts
// @verdict: error
// @code: STA1119
// SUBSET.md: FFI — a @statorLink pragma flag outside the link allowlist (docs/FFI.md section
// 9). Only -l<name>, -L<dir>, -framework <name> and -Wl,-rpath,<dir> may ride a pragma, so
// `-fplugin=` is refused where it is written: link configuration is permanent surface.
/// <reference path="./helper_extern_link_flag.d.ts" />

console.log(extF());
export {};
