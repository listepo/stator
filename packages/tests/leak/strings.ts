// The FFI string-conversion hygiene corpus: ten million round-trips through the step-3
// conversions (`jsrt_string_to_cstr` borrows + `jsrt_string_from_cstr` copies), watched the
// same way as objects.ts — RSS sampled from `ps`, a plateau asserted, never a value.
//
// Per iteration `strstr2` takes TWO borrows (a fresh haystack string + the `"needle"`
// literal, each `to_cstr`-malloc'd and freed after the call) and answers a pointer the
// boundary copies into a fresh GC string (`from_cstr`). Nothing here retains anything —
// `sum` is a number — so a runtime that frees borrows and collects copies holds a flat RSS
// across the loop, while a leak in EITHER direction grows linearly: ~350 malloc'd bytes
// per iteration when a borrow is never freed (collectors cannot see malloc), ~190 GC bytes
// when a copy is never collected, plus ~250 GC bytes of fresh-hay intermediaries when
// collection is off entirely. The smallest single-path outcome is ~1.9 GB over the loop,
// so the shared 64 MB cap separates it by ~30x — wider than the 5x the cap was sized for,
// and the passing side is the same few-MB steady state as objects.ts.
//
// The declarations live in the landed extern_strstr golden's binding file (pure libc
// `strstr`: the two-CString-in, one-CString-out shape, zero link flags, so this fixture
// builds with the same bare `stator build` the runner issues). The tail is always
// `"needle" + TAIL` — the haystack's one occurrence of the needle is the literal splice
// point — so the checksum is 10M times the tail length, read off the COPY (`tail.length`)
// so a runtime that skipped the conversion could not answer it. Node answers through the
// shim's indexOf+slice mirror, preloaded by the runner (the golden `--import` pattern).
// oxlint-disable-next-line typescript/triple-slash-reference -- STA1121 keeps extern bindings in a .d.ts, every FFI fixture pulls its helper in with this directive, and the binding file exports nothing to import.
/// <reference path="../golden/ts/extern_strstr/libc.d.ts" />

const TAIL: string =
  '-tail-0123456789-abcdefghijklmnopqrstuvwxyz-0123456789-abcdefghijklmnopqrstuvwxyz-012345';
let sum: number = 0;
for (let i: number = 0; i < 10000000; i = i + 1) {
  const hay: string = 'h' + i + 'needle' + TAIL;
  const tail: string = strstr2(hay as CString, 'needle' as CString);
  sum = sum + tail.length;
}
console.log(sum);
