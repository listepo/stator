// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Modules -- `import()` of a package: its namespace lives in the vendor bundle,
// where Rolldown builds it with `__exportAll` (plan.md §11d T12.3). It was an internal STA4031.

import('leftpad').then(() => 0);
