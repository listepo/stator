/* Test262 feature tags are a projection of docs/SUBSET.md, never a second subset authority. */

export type FeatureStatus =
  | { readonly kind: 'supported'; readonly row: string }
  | { readonly kind: 'not-yet'; readonly code: string; readonly row: string }
  | { readonly kind: 'never'; readonly row: string };

const SUPPORTED: Readonly<Record<string, string>> = {
  Array: 'Array.prototype row in docs/SUBSET.md',
  'array-methods': 'Array.prototype row in docs/SUBSET.md',
  'arrow-functions': 'Function declarations and arrow functions row in docs/SUBSET.md',
  'async-functions': 'async function row in docs/SUBSET.md',
  'block-scoping': 'let, const bindings row in docs/SUBSET.md',
  classes: 'Classes with fixed shape row in docs/SUBSET.md',
  'computed-property-names': 'Object literal forms row in docs/SUBSET.md',
  'default-parameters': 'Default parameter values row in docs/SUBSET.md',
  destructuring: 'Object and array destructuring rows in docs/SUBSET.md',
  'destructuring-binding': 'Object and array destructuring rows in docs/SUBSET.md',
  'for-in': 'for-in loop row in docs/SUBSET.md',
  'for-of': 'for-of loop row in docs/SUBSET.md',
  generators: 'Generator functions and yield row in docs/SUBSET.md',
  Map: 'Map row in docs/SUBSET.md',
  Set: 'Set row in docs/SUBSET.md',
  'template-literals': 'Template literals row in docs/SUBSET.md',
  'object-rest': 'Object literal forms row in docs/SUBSET.md',
  'object-spread': 'Object literal forms row in docs/SUBSET.md',
  'optional-catch-binding': 'try/catch/finally row in docs/SUBSET.md',
  'promise-prototype-finally': 'Promise.prototype row in docs/SUBSET.md',
  'regexp-dotall': 'RegExp row in docs/SUBSET.md',
  'regexp-lookbehind': 'RegExp row in docs/SUBSET.md',
  'regexp-named-groups': 'RegExp row in docs/SUBSET.md',
  'regexp-unicode-property-escapes': 'RegExp row in docs/SUBSET.md',
  'rest-parameters': 'Rest parameters row in docs/SUBSET.md',
  'symbol-description': 'Symbol row in docs/SUBSET.md',
  'top-level-await': 'Top-level await row in docs/SUBSET.md',
};

const NOT_YET: Readonly<Record<string, { readonly code: string; readonly row: string }>> = {
  BigInt: { code: 'STA1214', row: 'BigInt row in docs/SUBSET.md' },
  'async-generators': {
    code: 'STA1201',
    row: 'Generator functions and yield row in docs/SUBSET.md',
  },
  'for-await-of': { code: 'STA1201', row: 'for-of loop row in docs/SUBSET.md' },
  'dynamic-import': { code: 'STA1207', row: 'import() dynamic import row in docs/SUBSET.md' },
  'import-attributes': { code: 'STA1207', row: 'import() dynamic import row in docs/SUBSET.md' },
  'private-methods': { code: 'STA1214', row: 'Class member surface row in docs/SUBSET.md' },
  Symbol: { code: 'STA1212', row: 'Symbol row in docs/SUBSET.md' },
  'Symbol.iterator': { code: 'STA1212', row: 'Symbol row in docs/SUBSET.md' },
  'regexp-match-indices': { code: 'STA1211', row: 'RegExp row in docs/SUBSET.md' },
};

const NEVER: Readonly<Record<string, string>> = {
  Proxy: 'Proxy row in docs/SUBSET.md',
  eval: 'eval() function row in docs/SUBSET.md',
  'with-statement': 'with statement row in docs/SUBSET.md',
};

export function featureStatus(feature: string): FeatureStatus | undefined {
  const supported = SUPPORTED[feature];
  if (supported !== undefined) {
    return { kind: 'supported', row: supported };
  }
  const notYet = NOT_YET[feature];
  if (notYet !== undefined) {
    return { kind: 'not-yet', ...notYet };
  }
  const never = NEVER[feature];
  return never === undefined ? undefined : { kind: 'never', row: never };
}
