// Node-side bindings for the extern_bytes golden (packages/tests/golden/run.ts): the same calls
// the Stator side makes into ffi.c, over the same views, counted the same way.
type Bindings = Record<string, unknown>;
const bindings = globalThis as unknown as Bindings;
let calls = 0;

bindings.bytesCalls = (): number => calls;
bindings.bytesFill = (buf: Uint8Array, value: number): number => {
  calls += 1;
  buf.fill(value);
  return buf.length;
};
bindings.bytesSum = (buf: Uint8Array): number => {
  calls += 1;
  return buf.reduce((sum, byte) => sum + byte, 0);
};
bindings.bytesReverse = (buf: Uint8Array): void => {
  calls += 1;
  buf.reverse();
};
bindings.bytesEqual = (a: Uint8Array, b: Uint8Array): number => {
  calls += 1;
  return a.length === b.length && a.every((byte, i) => byte === b[i]) ? 1 : 0;
};
