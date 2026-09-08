/* jsrt.h — public entry header for the Stator C11 runtime.
 *
 * The value representation (jsrt_value, JSString, JSRT_FRAME/JSRT_LOCAL) lands in
 * jsrt_value.h alongside docs/VALUE.md — plan.md §5 Task 2.1, before any C emission.
 */
#ifndef JSRT_H
#define JSRT_H

#include <stddef.h>

/* Bumped whenever the codegen<->runtime contract changes; generated C asserts it. */
#define JSRT_ABI_VERSION 0

int jsrt_abi_version(void);

/* Fatal error handler: prints message and stack-frame count, then aborts.
 *
 * `_Noreturn` is part of the contract, not decoration: a caller that ends in a panic -- a failed
 * boundary check, say -- has no value to return and must not be made to invent one. Without it,
 * every such caller needs an unreachable `return`, which reads as a path the code can take. */
_Noreturn void jsrt_panic(const char *msg);

/* The runtime's ONE collected allocation, and the only place that knows whether a collector is
 * configured at all. Everything that can hold a jsrt_value comes from here: under Boehm the
 * memory belongs to an object kind whose mark procedure unboxes, and a value stored in memory
 * from anywhere else is invisible to the collector (jsrt_gc.c). `what` names the allocation in
 * the out-of-memory panic; the call never returns NULL. */
void *jsrt_gc_alloc(size_t bytes, const char *what);

/* Called by jsrt_init once the pointer-width assumption holds. */
void jsrt_gc_init(void);

#endif /* JSRT_H */
