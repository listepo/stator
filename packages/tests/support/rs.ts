// Trial shim: node:test/vitest-style `test(name, { skip }, fn)` over rstest's `skipIf`.
import { afterAll, describe as rsDescribe, it as rsIt, test as rsTest } from '@rstest/core';
type Fn = () => unknown;
type Opts = { skip: boolean };
const wrap =
  (api: typeof rsTest) =>
  (name: string, a: Opts | Fn, b?: Fn): void => {
    if (typeof a === 'function') api(name, a as never);
    else if (b !== undefined) api.skipIf(a.skip)(name, b as never);
  };
export const test = wrap(rsTest);
export const it = wrap(rsIt);
export const describe = (name: string, a: Opts | Fn, b?: Fn): void => {
  if (typeof a === 'function') rsDescribe(name, a as () => void);
  else if (b !== undefined) rsDescribe.skipIf(a.skip)(name, b as () => void);
};
export { afterAll };
