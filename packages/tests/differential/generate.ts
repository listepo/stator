/* Deterministic, type-directed differential-fuzzer input generator (plan.md §9 Task 6.2). */

export type DifferentialMode = 'ts' | 'js';

import { pathToFileURL } from 'node:url';

type ValueType = 'number' | 'string' | 'boolean';

/** Xorshift32 is deliberately the only entropy source in this directory. */
export class XorShift32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  int(maxExclusive: number): number {
    return this.next() % maxExclusive;
  }
}

const NUMBER_EDGES = [
  -2147483648,
  -2147483647,
  -1,
  0,
  1,
  2147483646,
  2147483647,
  9007199254740991,
  0.1,
  1.5,
  Number.MIN_VALUE,
  Number.MAX_VALUE,
] as const;

const STRINGS = ['', 'a', 'hello', '\ud800', '\ud83d\udc4d', 'left\tright', '𝄞'];

// The values whose IDENTITY the spec treats differently from their equality, which is what makes
// them Map/Set key edges (SameValueZero folds -0 into 0 and makes NaN equal to itself) and print
// edges (`-0` keeps its sign, `NaN`/`Infinity` are not decimal). Kept OUT of NUMBER_EDGES because
// arithmetic over them mostly yields NaN, which would drown the float-formatting region rather
// than add to it (plan.md §9 Task 6.2 step 4).
const IDENTITY_EDGES = ['NaN', 'Infinity', '-Infinity', '-0', '0'] as const;

// Operands from disjoint types, so `==` has to run the coercion table rather than compare directly.
// js mode only: ts mode refuses a cross-type `==` (STA0012, TS 2367), which is the whole point of
// the subset_loose_equals_cross_type pair. `Object.is` is deliberately absent -- still STA1214.
const COERCION_OPERANDS = ['""', '"1"', '"0"', '0', '1', 'null', 'undefined', 'false', 'true'] as const;

function pick(values: readonly string[], random: XorShift32): string {
  return values[random.int(values.length)] ?? '0';
}

function numberLiteral(value: number): string {
  return Object.is(value, -0) ? '-0' : String(value);
}

function chooseType(random: XorShift32): ValueType {
  const pick = random.int(10);
  return pick < 6 ? 'number' : pick < 8 ? 'string' : 'boolean';
}

function expression(type: ValueType, random: XorShift32, depth: number): string {
  if (depth === 0) {
    if (type === 'number') {
      return numberLiteral(NUMBER_EDGES[random.int(NUMBER_EDGES.length)] ?? 0);
    }
    if (type === 'string') {
      return JSON.stringify(STRINGS[random.int(STRINGS.length)] ?? '');
    }
    return random.int(2) === 0 ? 'false' : 'true';
  }

  if (type === 'number') {
    const choice = random.int(6);
    if (choice === 0) {
      return `(${expression('number', random, depth - 1)} + ${expression('number', random, depth - 1)})`;
    }
    if (choice === 1) {
      return `(${expression('number', random, depth - 1)} * ${expression('number', random, depth - 1)})`;
    }
    if (choice === 2) {
      return `Math.trunc(${expression('number', random, depth - 1)})`;
    }
    if (choice === 3) {
      return `Math.abs(${expression('number', random, depth - 1)})`;
    }
    if (choice === 4) {
      return `(${expression('number', random, depth - 1)} % ${expression('number', random, 0)})`;
    }
    return numberLiteral(NUMBER_EDGES[random.int(NUMBER_EDGES.length)] ?? 0);
  }
  if (type === 'string') {
    if (random.int(3) === 0) {
      return `(${expression('string', random, depth - 1)} + ${expression('string', random, depth - 1)})`;
    }
    return JSON.stringify(STRINGS[random.int(STRINGS.length)] ?? '');
  }
  if (random.int(2) === 0) {
    return `(Math.trunc(${expression('number', random, depth - 1)}) === Math.trunc(${expression('number', random, depth - 1)}))`;
  }
  return random.int(2) === 0 ? 'false' : 'true';
}

function typedProgram(random: XorShift32): string {
  const lines: string[] = [];
  const first = chooseType(random);
  const second = chooseType(random);
  lines.push(`const a: ${first} = ${expression(first, random, 2)};`);
  lines.push(`let b: ${second} = ${expression(second, random, 2)};`);
  lines.push(`b = ${expression(second, random, 1)};`);
  lines.push(`const values: number[] = [${expression('number', random, 1)}, ${expression('number', random, 1)}];`);
  lines.push('let total: number = 0;');
  lines.push('for (const value of values) { total += value; }');
  lines.push('console.log(a);');
  lines.push('console.log(b);');
  lines.push('console.log(total);');
  lines.push('console.log(values.length);');
  // String indexing across surrogate pairs and the identity/print edges: two of the five regions
  // step 4 names, and the two the golden fixtures cannot enumerate by hand. `codePointAt` stays in
  // the js half -- it is `number | undefined`, which ts mode would have to narrow first.
  lines.push(`const text: string = ${JSON.stringify(STRINGS[random.int(STRINGS.length)] ?? '')};`);
  lines.push('console.log(text.length);');
  lines.push(`console.log(text.charCodeAt(${String(random.int(4))}));`);
  lines.push(`const edge: number = ${pick(IDENTITY_EDGES, random)};`);
  lines.push('console.log(edge);');
  lines.push('console.log(1 / edge);');
  return `${lines.join('\n')}\n`;
}

function dynamicProgram(random: XorShift32): string {
  const number = expression('number', random, 2);
  const string = expression('string', random, 1);
  const key = random.int(2) === 0 ? '"value"' : '"other"';
  const keyA = pick(IDENTITY_EDGES, random);
  const keyB = pick(IDENTITY_EDGES, random);
  const left = pick(COERCION_OPERANDS, random);
  const right = pick(COERCION_OPERANDS, random);
  return [
    `var n = ${number};`,
    `const text = ${string};`,
    'const object = {};',
    `object[${key}] = n;`,
    'let total = 0;',
    'for (var i = 0; i < 2; i += 1) { total += i; }',
    'console.log(object.value ?? object.other);',
    'console.log(text);',
    'console.log(n == total);',
    // Map/Set key identity is SameValueZero, which agrees with neither `===` (NaN) nor `==` (-0),
    // so it is only reachable through the containers themselves.
    'const map = new Map();',
    `map.set(${keyA}, "a");`,
    `map.set(${keyB}, "b");`,
    'console.log(map.size);',
    `console.log(map.get(${keyA}));`,
    'const set = new Set();',
    `set.add(${keyA});`,
    `set.add(${keyB});`,
    'console.log(set.size);',
    `console.log(${left} == ${right});`,
    'console.log(text.length);',
    `console.log(text.codePointAt(${String(random.int(4))}));`,
    '',
  ].join('\n');
}

export function generateProgram(seed: number, mode: DifferentialMode): string {
  const random = new XorShift32(seed);
  return mode === 'ts' ? typedProgram(random) : dynamicProgram(random);
}

function parseSeed(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new Error('--seed=N is required and N must be a non-negative integer');
  }
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed)) {
    throw new Error('--seed=N must be a safe integer');
  }
  return seed;
}

function main(): void {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='))?.slice('--seed='.length);
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length) ?? 'ts';
  const seed = parseSeed(seedArg);
  if (modeArg !== 'ts' && modeArg !== 'js') {
    throw new Error('--mode must be ts or js');
  }
  process.stdout.write(`seed: ${String(seed)}\n${generateProgram(seed, modeArg)}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
