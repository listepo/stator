// @mode: js
// @verdict: static
// SUBSET.md: loose equality

// `"" == 0` is not a mistake in JavaScript, it is the coercion table, and running that table is
// most of what js mode is for. TypeScript's 2367 ("this comparison appears to be unintentional")
// is a lint about intent, so ts mode keeps it and js mode suppresses it (plan-notes 177). Found
// while weighting the differential fuzzer toward coercion order, which §9 Task 6.2 step 4 names
// as a region the golden suite cannot enumerate -- and which was ungeneratable until this.
console.log("" == 0);
console.log("1" == 1);
console.log(null == undefined);
