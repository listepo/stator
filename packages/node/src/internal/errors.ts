// The shape of Node's coded errors (lib/internal/errors.js, Node v26.7.0): a `name`, a `code` and
// a `message`, printed as `Name [CODE]: message`. A plain class, not a subclass of `Error`:
// extending a built-in is not-yet in Stator's subset, the gap `node:assert`'s `AssertionError`
// documents too. Not importable as a `node:*` module: only top-level files under `src/` are.

/** An error carrying Node's `code`. `name` is the constructor Node would use (`Error`,
 * `TypeError`, `RangeError`). */
export class NodeError {
  readonly name: string;
  readonly code: string;
  readonly message: string;

  constructor(name: string, code: string, message: string) {
    this.name = name;
    this.code = code;
    this.message = message;
  }

  toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}
