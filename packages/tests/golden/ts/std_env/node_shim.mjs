// Node-side bindings for the std_env golden (packages/tests/golden/run.ts): the same
// calls the Stator side makes as direct C calls, spelled in JS. `get` mirrors the
// `@statorError null` convention check and its message, so a divergence in Stator's
// check — a missing throw, a different message — still fails the diff (cf. extern_libm's
// node_shim.mjs). `set`/`unset` run against `process.env` for effect. The entry reads
// `TZ` (pinned `UTC` on both sides by the runner) and a `STATOR_`-prefixed scratch name.
globalThis.stdEnvGet = (name) => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error("extern call 'stdEnvGet' failed: NULL return");
  }
  return value;
};
globalThis.stdEnvSet = (name, value) => {
  process.env[name] = value;
  return 0;
};
globalThis.stdEnvUnset = (name) => {
  delete process.env[name];
  return 0;
};
