// Untyped, so the checker infers each return from its body: `pick` answers `1 | "one"`, `flag`
// answers `boolean | "no"`.
export function pick(wantNumber) {
  return wantNumber ? 1 : "one";
}

export function flag(on) {
  return on ? true : "no";
}
