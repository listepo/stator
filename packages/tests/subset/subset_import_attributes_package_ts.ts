// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Modules -- an attributed package import: ts mode never bundles (plan.md §11d
// T12.1). js mode carries the attributes into the vendor entry (T12.3; golden
// `js/pkg_import_json`).

import data from 'conf/data.json' with { type: 'json' };
console.log(data);
