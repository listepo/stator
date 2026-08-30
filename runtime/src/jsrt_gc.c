/* jsrt_gc.c — the one collected allocation, and the two hooks that make it correct.
 *
 * Boehm is a CONSERVATIVE collector: it scans memory word by word and retains anything that
 * looks like a heap address. A jsrt_value is not one. NaN-boxing puts the tag above bit 48, so
 * a boxed reference never looks like a pointer — the collector walks straight past every value
 * a Map, an array, an object slot or a stack frame holds, and frees objects that are still live
 * (plan-notes 108: without these hooks a forced collection over a 200-entry Map SIGSEGVs).
 *
 * Boehm 8.2 has no GC_set_pointer_mask, so the two places a reference can hide each get an
 * explicit hook that unboxes before testing:
 *
 *   - the heap, via a custom object kind whose mark procedure masks every word it scans. Every
 *     collected allocation in the runtime comes from jsrt_gc_alloc, so the kind covers all of it.
 *   - the roots, via GC_set_push_other_roots over the JSRT_FRAME shadow stack. This is what the
 *     rooting discipline was always for; until now the frames were bookkeeping nothing read.
 *
 * Masking is safe for BOTH word shapes the runtime stores: a boxed value's payload is its low 48
 * bits, and a raw pointer's top 16 bits are zero (jsrt_init asserts exactly that against a real
 * allocation), so the mask is the identity on raw pointers. A word that is neither — a double, a
 * length — can mask to a plausible address and retain one object it does not own. That is
 * ordinary conservative-collector behaviour: it costs memory, never correctness.
 *
 * Without Boehm the file is plain malloc and no collection, which is the configuration every
 * machine without bdw-gc installed builds. */

#include "jsrt.h"
#include "jsrt_value.h"

#include <stdio.h>
#include <stdlib.h>

/* A zero-byte request is a real one -- an empty array literal still wants an element buffer -- and
 * malloc may answer NULL for it, which is indistinguishable from failure. One granule instead. */
static size_t alloc_size(size_t bytes) { return bytes == 0 ? 1 : bytes; }

static _Noreturn void *oom(const char *what) {
  char msg[128];
  snprintf(msg, sizeof msg, "out of memory: %s", what);
  jsrt_panic(msg);
}

#ifdef JSRT_HAVE_BOEHM

#include <gc.h>
#include <gc/gc_mark.h>

static int jsrt_kind;

static struct GC_ms_entry *jsrt_mark(GC_word *addr, struct GC_ms_entry *msp,
                                     struct GC_ms_entry *msl, GC_word env) {
  (void)env;
  /* The header's size, so this works for every allocation shape the runtime has — a fixed
   * struct, a flexible array member, a bare jsrt_value buffer — without any of them carrying a
   * layout descriptor. It rounds up to the granule, so the tail may scan padding; padding is
   * inside the object's own block and cleared, so reading it is harmless.
   *
   * A mark procedure can also be handed a cleared object on a free list, whose first word is a
   * free-list link. Masking a raw pointer is the identity, so that word marks the next free
   * object: it retains one dead object for a cycle, and cannot corrupt anything. */
  size_t words = GC_size(addr) / sizeof(GC_word);
  for (size_t i = 0; i < words; i++) {
    GC_word p = addr[i] & JSRT_PAYLOAD_MASK;
    msp = GC_MARK_AND_PUSH((void *)p, msp, msl, (void **)&addr[i]);
  }
  return msp;
}

/* Roots are pushed a chunk at a time through a plain array of RAW pointers, because the eager
 * push scans a memory range conservatively — which is precisely what fails on a boxed value.
 * Unboxing into this buffer first is what makes the range scannable. The buffer is dead by the
 * time the call returns: GC_push_all_eager marks its contents immediately rather than recording
 * the range for later. */
#define ROOT_CHUNK 128

static void GC_CALLBACK jsrt_push_roots(void) {
  void *raw[ROOT_CHUNK];
  size_t n = 0;
  for (const JSRTFrame *f = jsrt_frame_top; f != NULL; f = f->prev) {
    for (uint32_t i = 0; i < f->count; i++) {
      raw[n++] = (void *)(uintptr_t)(f->slots[i] & JSRT_PAYLOAD_MASK);
      if (n == ROOT_CHUNK) {
        GC_push_all_eager(raw, raw + n);
        n = 0;
      }
    }
    if (f->env != NULL) {
      /* Only the environment itself: it is a collected allocation, so the mark procedure above
       * walks its slots and its parent link from here. */
      raw[n++] = (void *)f->env;
      if (n == ROOT_CHUNK) {
        GC_push_all_eager(raw, raw + n);
        n = 0;
      }
    }
  }
  if (n > 0) {
    GC_push_all_eager(raw, raw + n);
  }
  /* The one root that is not a frame slot: an exception in flight, whose only reference is the
   * mailbox while the `finally` blocks on the way out run — and allocate. */
  void *pending = (void *)(uintptr_t)(*jsrt_pending_slot() & JSRT_PAYLOAD_MASK);
  GC_push_all_eager(&pending, &pending + 1);
}

void jsrt_gc_init(void) {
  GC_INIT();
  jsrt_kind = (int)GC_new_kind(GC_new_free_list(), GC_MAKE_PROC(GC_new_proc(jsrt_mark), 0), 0, 1);
  GC_set_push_other_roots(jsrt_push_roots);
}

void *jsrt_gc_alloc(size_t bytes, const char *what) {
  void *p = GC_generic_malloc(alloc_size(bytes), jsrt_kind);
  return p != NULL ? p : oom(what);
}

#else /* !JSRT_HAVE_BOEHM */

void jsrt_gc_init(void) {}

void *jsrt_gc_alloc(size_t bytes, const char *what) {
  void *p = malloc(alloc_size(bytes));
  return p != NULL ? p : oom(what);
}

#endif /* JSRT_HAVE_BOEHM */
