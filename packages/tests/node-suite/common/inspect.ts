/* What the harness prints with Node's `util.inspect`, for the values the selection passes
 * (plan.md §11c T11.7). `node:util` is N2 (plan.md §11c, deferred), so `common/` cannot import it
 * and still build under Stator in N1; this ports the part the messages compare against, from Node
 * v26.7.0 lib/internal/util/inspect.js (`formatPrimitive`, `strEscape`;
 * https://github.com/nodejs/node/blob/v26.7.0/lib/internal/util/inspect.js). Primitives print as
 * Node prints them, except that a string is never split across lines and a lone surrogate is not
 * escaped. A plain object, an array or a null-prototype object prints in `inspect`'s
 * `depth: -1` form, which is all `invalidArgTypeHelper` asks for; any other object prints as
 * `[<constructor name>]`, which `depth: -1` matches only when it has entries. `mustNotCall`'s
 * argument report uses the same printer. */

/** `strEscape`'s escapes for C0 controls and DEL: the short form where JS has one. */
function escapeUnit(unit: number): string {
  switch (unit) {
    case 0x08:
      return '\\b';
    case 0x09:
      return '\\t';
    case 0x0a:
      return '\\n';
    case 0x0c:
      return '\\f';
    case 0x0d:
      return '\\r';
    default:
      return `\\x${unit.toString(16).toUpperCase().padStart(2, '0')}`;
  }
}

/** A string as `inspect` quotes it: single quotes, unless the text holds one and a double or
 * backtick quote does not need escaping. */
export function quoteString(text: string): string {
  let quote = "'";
  if (text.includes("'")) {
    if (!text.includes('"')) quote = '"';
    else if (!text.includes('`') && !text.includes('${')) quote = '`';
  }
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    const char = text.charAt(i);
    if (unit < 0x20 || unit === 0x7f) out += escapeUnit(unit);
    else if (char === quote || char === '\\') out += `\\${char}`;
    else out += char;
  }
  return `${quote}${out}${quote}`;
}

/** `inspect(value, { depth: -1 })` for the values the selection uses. */
export function inspectValue(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return quoteString(value);
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value);
    case 'bigint':
      return `${String(value)}n`;
    case 'function':
      return value.name === '' ? '[Function (anonymous)]' : `[Function: ${value.name}]`;
    case 'object': {
      if (value === null) return 'null';
      const name: unknown =
        Object.getPrototypeOf(value) === null ? undefined : value.constructor?.name;
      // `depth: -1` still prints an empty container whole.
      const empty = Object.keys(value).length === 0;
      if (typeof name !== 'string') {
        return empty ? '[Object: null prototype] {}' : '[Object: null prototype]';
      }
      if (Array.isArray(value)) return empty ? '[]' : '[Array]';
      return empty && name === 'Object' ? '{}' : `[${name}]`;
    }
    case 'boolean':
    case 'symbol':
    case 'undefined':
      return String(value);
  }
}
