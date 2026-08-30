// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: String.prototype
// `match` answers `RegExpMatchArray | null`, and the non-global form of that array carries
// `index`, `input` and `groups` as PROPERTIES -- which a dense jsrt array cannot hold. It waits on
// the same representation `exec` waits on, so it is not in the op table at all.

const found = 'a1b'.match(/\d/);
export { found };
