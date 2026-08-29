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

/* Fatal error handler: prints message and stack-frame count, then aborts. */
void jsrt_panic(const char *msg);

#endif /* JSRT_H */
