// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Class member signatures (overloads, abstract and optional members, `super(...)` placement)
// The js-mode twin: `?` on a class member exists only in a `.ts` file, which js mode compiles
// alongside JavaScript (plan-notes 233).

class Opts {
  label?: string;
  size = 1;
  describe?(): string {
    return `size ${this.size}`;
  }
  hook?(): void;
}
const o = new Opts();
export const x = o.label ?? o.describe?.() ?? 'none';
export const y = o.hook === undefined;
