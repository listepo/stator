/* jsrt.h — public entry header for the Stator C11 runtime.
 *
 * The value representation (jsrt_value, JSString, JSRT_FRAME/JSRT_LOCAL) lands in
 * jsrt_value.h alongside docs/VALUE.md — plan.md §5 Task 2.1, before any C emission.
 */
#ifndef JSRT_H
#define JSRT_H

/* Bumped whenever the codegen<->runtime contract changes; generated C asserts it. */
#define JSRT_ABI_VERSION 0

int jsrt_abi_version(void);

/* Fatal error handler: prints message and stack-frame count, then aborts.
 *
 * `_Noreturn` is part of the contract, not decoration: a caller that ends in a panic -- a failed
 * boundary check, say -- has no value to return and must not be made to invent one. Without it,
 * every such caller needs an unreachable `return`, which reads as a path the code can take. */
_Noreturn void jsrt_panic(const char *msg);

#endif /* JSRT_H */
