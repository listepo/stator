/* The oracle's spelling of a std failure: the message packages/std/src/internal/error.ts builds,
 * `<module>.<fn>(<argument>): <CODE>`, with the code taken from Node's own `error.code`. */

export function failure(call: string, argument: string, code: string): Error {
  return new Error(`${call}(${argument}): ${code}`);
}

export function quote(text: string): string {
  return `'${text}'`;
}

/** Runs `body`, rethrowing a Node system error as the std message for `call`. */
export function rethrow<T>(call: string, argument: string, body: () => T): T {
  try {
    return body();
  } catch (error: unknown) {
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'EIO';
    throw failure(call, argument, code);
  }
}
