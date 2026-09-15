// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- an anonymous DECLARATION (`export default class { … }`) has no name to
// identify its layout by, so nominal equality has nothing to hold onto. Expected message
// (pinned in gate.test.ts -- explain reports verdicts, not prose): "an anonymous class is not
// yet supported; planned for Phase 5".

export default class {
  m() {
    return 7;
  }
}
