# Stator C11 runtime -> build/libjsrt.a (release) and build-asan/libjsrt.a (sanitized).
# Generated C is never hand-edited; this archive is the codegen<->runtime contract's other half.

# `CC ?= clang` would lose to make's built-in default (cc); override only that default,
# so an explicitly-set CC from the environment still wins.
ifeq ($(origin CC),default)
CC := clang
endif
AR ?= ar

CFLAGS_COMMON := -std=c11 -Wall -Wextra -Werror -Iinclude

# Boehm GC detection: if bdw-gc is available via pkg-config, use it; otherwise,
# fall back to plain malloc with optional GC disabled. Both configurations
# must build successfully for v0.
#
# This block MUST stay above the CFLAGS_REL/CFLAGS_ASAN assignments: they expand
# CFLAGS_COMMON with `:=`, so appending to it afterwards would silently drop
# -DJSRT_HAVE_BOEHM and build the malloc fallback while reporting "Boehm GC".
BDW_CFLAGS := $(shell pkg-config --cflags bdw-gc 2>/dev/null)
BDW_LIBS := $(shell pkg-config --libs bdw-gc 2>/dev/null)

ifdef BDW_CFLAGS
  CFLAGS_COMMON += -DJSRT_HAVE_BOEHM $(BDW_CFLAGS)
  GC_LIBS := $(BDW_LIBS)
  GC_STATUS := Boehm GC
else
  GC_LIBS :=
  GC_STATUS := plain malloc (no collection)
endif

# Header dependencies are generated, never listed: jsrt_value.h is the codegen<->runtime contract,
# and a build that does not rebuild when it changes will happily link a corpus against a struct that
# no longer exists (plan-notes 66).
DEPFLAGS      := -MMD -MP

CFLAGS_REL    := $(CFLAGS_COMMON) $(DEPFLAGS) -O2
CFLAGS_ASAN   := $(CFLAGS_COMMON) $(DEPFLAGS) -O1 -g -fsanitize=address,undefined

SRC       := $(wildcard src/*.c)
OBJ_REL   := $(patsubst src/%.c,build/%.o,$(SRC))
OBJ_ASAN  := $(patsubst src/%.c,build-asan/%.o,$(SRC))

NODE ?= node

.PHONY: all asan test test-asan clean
all: build/libjsrt.a
	@echo "Runtime built with: $(GC_STATUS)"

asan: build-asan/libjsrt.a
	@echo "Runtime (ASan) built with: $(GC_STATUS)"

# Every corpus is a .c/.mjs pair with the same name: the C prints through the runtime, the .mjs
# prints the same values through Node, and the two are diffed. Ground truth is Node, byte-for-byte
# -- never a table of expectations written next to the implementation, which would only assert
# that the code agrees with itself.
CORPORA := print_numbers print_arrays print_objects print_maps print_typeof

DEPS      := $(OBJ_REL:.o=.d) $(OBJ_ASAN:.o=.d) \
             $(addprefix build/,$(addsuffix .d,$(CORPORA))) \
             $(addprefix build-asan/,$(addsuffix .d,$(CORPORA)))

test: $(addprefix build/,$(CORPORA))
	@for corpus in $(CORPORA); do \
		$(NODE) tests/$$corpus.mjs > build/$$corpus.expected.txt; \
		./build/$$corpus > build/$$corpus.actual.txt; \
		diff -u build/$$corpus.expected.txt build/$$corpus.actual.txt || exit 1; \
	done
	@echo "runtime: print corpus matches Node"

test-asan: $(addprefix build-asan/,$(CORPORA))
	@for corpus in $(CORPORA); do \
		$(NODE) tests/$$corpus.mjs > build-asan/$$corpus.expected.txt; \
		./build-asan/$$corpus > build-asan/$$corpus.actual.txt; \
		diff -u build-asan/$$corpus.expected.txt build-asan/$$corpus.actual.txt || exit 1; \
	done
	@echo "runtime: print corpus matches Node (ASan/UBSan)"

build/%: tests/%.c build/libjsrt.a
	$(CC) $(CFLAGS_REL) $< -Lbuild -ljsrt $(GC_LIBS) -o $@

build-asan/%: tests/%.c build-asan/libjsrt.a
	$(CC) $(CFLAGS_ASAN) $< -Lbuild-asan -ljsrt $(GC_LIBS) -o $@

build/libjsrt.a: $(OBJ_REL)
	$(AR) rcs $@ $^

build-asan/libjsrt.a: $(OBJ_ASAN)
	$(AR) rcs $@ $^

build/%.o: src/%.c | build
	$(CC) $(CFLAGS_REL) -c $< -o $@

build-asan/%.o: src/%.c | build-asan
	$(CC) $(CFLAGS_ASAN) -c $< -o $@

build build-asan:
	mkdir -p $@

clean:
	rm -rf build build-asan

-include $(DEPS)
