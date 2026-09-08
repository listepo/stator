// Differential finding, seed 20260915, 2026-09-03 (plan.md §9 Task 6.2 step 7; plan-notes 178).
// A JS string is a sequence of UTF-16 code UNITS and a lone surrogate is a legal one, so
// `charCodeAt(0)` here is 55296. The emitter used to write literals as raw characters into the .c
// file, where the UTF-8 file encoding replaced the unpaired surrogate with U+FFFD and the answer
// came back 65533. Literals now travel as WTF-8 octal escapes.

const lone: string = "\ud800";
console.log(lone.length);
console.log(lone.charCodeAt(0));

const pair: string = "👍";
console.log(pair.length);
console.log(pair.charCodeAt(0));
console.log(pair.charCodeAt(1));
console.log(pair);

const mixed: string = "a\ud800b\udfffc";
console.log(mixed.length);
console.log(mixed.charCodeAt(1));
console.log(mixed.charCodeAt(3));

const bmp: string = "日本語";
console.log(bmp.length);
console.log(bmp.charCodeAt(0));
console.log(bmp);

// The print and JSON paths for the same code unit: Node's stdout writer substitutes U+FFFD for an
// unpaired surrogate, and JSON.stringify escapes it as \udXXX (well-formed stringify). Both already
// agreed; pinned here so the emitter fix cannot be undone by "fixing" one of them.
console.log(mixed);
console.log(JSON.stringify(mixed));
