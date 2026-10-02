// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Modules -- `export * from` a package: ts mode never bundles, so a package specifier
// is refused (plan.md §11d T12.1). js mode re-exports the names the bundle exports for it
// (T12.3; golden `js/pkg_export_star`).

export * from 'leftpad';
