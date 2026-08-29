/* jsrt_throw.c — the pending-exception cell (plan.md §6 Task 3.10).
 *
 * The state is deliberately this small: one value, one flag, per thread. Everything interesting
 * about exceptions — which catch receives one, in what order the finally blocks run, how a frame
 * is popped on the way out — is a property of the GENERATED C, decided by the emitter where the
 * scope structure is known, not of the runtime, which cannot see scopes at all. The runtime's
 * whole contribution is a mailbox the unwind protocol reads; the protocol itself is documented
 * at the declarations in jsrt_value.h.
 */

#include "jsrt_value.h"

_Thread_local static jsrt_value pending_value;
_Thread_local static bool pending_flag;

void jsrt_throw(jsrt_value v) {
  /* Overwriting an already-pending exception is legal and REQUIRED: a throw inside a finally
   * replaces the completion that got the finally running, which is JavaScript's rule, and the
   * generated code relies on the newest throw winning. */
  pending_value = v;
  pending_flag = true;
}

bool jsrt_pending(void) {
  return pending_flag;
}

jsrt_value jsrt_take_exception(void) {
  /* Clear the cell as well as the flag: a taken exception the cell kept alive would be a leak
   * under a real collector, invisible under this one. */
  jsrt_value v = pending_value;
  pending_value = JSRT_UNDEFINED;
  pending_flag = false;
  return v;
}
