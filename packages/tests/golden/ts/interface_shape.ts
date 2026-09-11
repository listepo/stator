// An interface with an optional property IS a dynamic shape (plan-notes 223, plan.md §8 step 16).
// `docs/SUBSET.md` sends a literal with an optional property to the shape table whichever spelling
// introduced it, and an interface is the same type as its anonymous twin. The interface was left
// out of that test, so the literal became a fixed layout while its HType was Unknown: `delete o.x`
// passed the gate (Unknown reads as dynamic) and aborted at run time with STA2007 against a layout
// that cannot lose a slot, where Node answers `true`.
interface Optional {
  x?: number;
  y?: number;
}

const o: Optional = { x: 1, y: 2 };
console.log(o.x);
console.log(`${delete o.x}`);
console.log(o.x);
console.log(`${'x' in o}`);
console.log(`${'y' in o}`);
o.x = 10;
console.log(o.x);
console.log(`${'z' in o}`);

// The same shape spelled anonymously stays dynamic, and a REQUIRED-property interface stays the
// fixed layout it always was (its reads go through the shape table because its HType is Unknown,
// which is correct either way).
const anon: { p?: number } = { p: 5 };
console.log(`${delete anon.p}`);
