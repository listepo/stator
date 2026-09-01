# Stator C11 runtime -> build/libjsrt.a (release), build-asan/libjsrt.a (sanitized) and
# build-intl/libjsrt.a (the ICU feature build, `make intl` -- off by default).
# Generated C is never hand-edited; this archive is the codegen<->runtime contract's other half.

# `CC ?= clang` would lose to make's built-in default (cc); override only that default,
# so an explicitly-set CC from the environment still wins.
ifeq ($(origin CC),default)
CC := clang
endif
AR ?= ar

# -ffunction-sections/-fdata-sections: every builtin in its own section, so the final link's
# dead-stripping (Task 3.12) removes builtins the program never references at FUNCTION granularity
# rather than pulling whole .o files out of the archive. Free on Mach-O (per-symbol subsections are
# the default there); required on ELF for --gc-sections to have anything to drop.
VENDOR_INC := -Ivendor/quickjs-ng -Ivendor/fdlibm
CFLAGS_COMMON := -std=c11 -Wall -Wextra -Werror -Iinclude $(VENDOR_INC) \
                 -ffunction-sections -fdata-sections

# Vendored code (runtime/vendor/: quickjs-ng's libregexp, V8's fdlibm) is compiled WITHOUT -Wextra
# -Werror. It is not ours to edit -- AGENTS.md forbids hand-editing vendor/, so holding it to our
# warning policy would force exactly the edits that rule forbids. Everything in src/, including the
# bridge that calls into it, keeps the full flags (plan-notes 101).
CFLAGS_VENDOR := -std=c11 -Wall -Iinclude $(VENDOR_INC) -ffunction-sections -fdata-sections

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

# Intl/ICU (plan.md Task 4.4) is a FEATURE BUILD, not a configuration of the default one: the
# default archive must stay byte-identical whether or not ICU happens to be installed, because a
# runtime that silently changes with the host's package set is not reproducible. So ICU lives in
# its own object directory -- make cannot detect a stale flag, only a stale timestamp, and
# -DJSRT_HAVE_ICU flipping under the same .o names is exactly the mistake it cannot catch.
ICU_CFLAGS := $(shell pkg-config --cflags icu-uc icu-i18n 2>/dev/null)
ICU_LIBS := $(shell pkg-config --libs icu-uc icu-i18n 2>/dev/null)

# Header dependencies are generated, never listed: jsrt_value.h is the codegen<->runtime contract,
# and a build that does not rebuild when it changes will happily link a corpus against a struct that
# no longer exists (plan-notes 66).
DEPFLAGS      := -MMD -MP

CFLAGS_REL    := $(CFLAGS_COMMON) $(DEPFLAGS) -O2
CFLAGS_ASAN   := $(CFLAGS_COMMON) $(DEPFLAGS) -O1 -g -fsanitize=address,undefined
# -DUCHAR_TYPE=uint16_t is ICU's own supported way to say "UChar is the embedder's 16-bit unit":
# it makes ICU's UTF-16 APIs take the same uint16_t* a JSString already holds, so the strings pass
# through without a cast that would violate aliasing or a copy that would buy nothing.
CFLAGS_INTL   := $(CFLAGS_COMMON) $(DEPFLAGS) -O2 -DJSRT_HAVE_ICU -DUCHAR_TYPE=uint16_t $(ICU_CFLAGS)

SRC       := $(wildcard src/*.c)
OBJ_REL   := $(patsubst src/%.c,build/%.o,$(SRC))
OBJ_ASAN  := $(patsubst src/%.c,build-asan/%.o,$(SRC))
OBJ_INTL  := $(patsubst src/%.c,build-intl/%.o,$(SRC))

# Vendored objects get a `vendor_` prefix so they cannot collide with a src/ file of the same name
# in the flat build directory. Basenames must stay unique ACROSS vendor directories for the same
# reason -- the prefix carries no directory -- which is true today (libregexp/libunicode/fdlibm).
VENDOR_SRC   := $(wildcard vendor/*/*.c)
VENDOR_REL   := $(addprefix build/vendor_,$(notdir $(VENDOR_SRC:.c=.o)))
VENDOR_ASAN  := $(addprefix build-asan/vendor_,$(notdir $(VENDOR_SRC:.c=.o)))
VENDOR_INTL  := $(addprefix build-intl/vendor_,$(notdir $(VENDOR_SRC:.c=.o)))
# Let the pattern rules below find a vendored .c without naming its directory.
vpath %.c $(sort $(dir $(VENDOR_SRC)))

NODE ?= node

.PHONY: all asan intl test test-asan clean
# Every build records the libraries a program linking its archive needs, into the directory that
# archive lives in: whoever links it must use the same bdw-gc -- and, for build-intl, the same ICU
# -- its objects were compiled against, and a file written by the build that produced them is the
# only way those two cannot disagree. `src/cli/build.ts` reads it back; rediscovering the flags
# there would ask pkg-config a second time, in a different environment. It is recorded on the
# PHONY target rather than the archive rule because installing bdw-gc changes the answer without
# changing a single .c file, and an archive compiled WITH Boehm linked WITHOUT -lgc is an
# undefined-symbol error at the end of every compile (plan-notes 106).
all: build/libjsrt.a
	@printf '%s\n' '$(GC_LIBS)' > build/link-flags.txt
	@echo "Runtime built with: $(GC_STATUS)"

asan: build-asan/libjsrt.a
	@printf '%s\n' '$(GC_LIBS)' > build-asan/link-flags.txt
	@echo "Runtime (ASan) built with: $(GC_STATUS)"

intl: build-intl/libjsrt.a
	@printf '%s\n' '$(GC_LIBS) $(ICU_LIBS)' > build-intl/link-flags.txt
	@echo "Runtime (Intl/ICU) built with: $(GC_STATUS)"

# Every corpus is a .c/.mjs pair with the same name: the C prints through the runtime, the .mjs
# prints the same values through Node, and the two are diffed. Ground truth is Node, byte-for-byte
# -- never a table of expectations written next to the implementation, which would only assert
# that the code agrees with itself.
CORPORA := print_numbers print_arrays print_objects print_maps print_shapes print_typeof \
           print_regexp print_promise

DEPS      := $(OBJ_REL:.o=.d) $(OBJ_ASAN:.o=.d) $(OBJ_INTL:.o=.d) \
             $(VENDOR_REL:.o=.d) $(VENDOR_ASAN:.o=.d) $(VENDOR_INTL:.o=.d) \
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

build/libjsrt.a: $(OBJ_REL) $(VENDOR_REL)
	$(AR) rcs $@ $^

build-asan/libjsrt.a: $(OBJ_ASAN) $(VENDOR_ASAN)
	$(AR) rcs $@ $^

build-intl/libjsrt.a: $(OBJ_INTL) $(VENDOR_INTL)
	$(AR) rcs $@ $^

build/%.o: src/%.c | build
	$(CC) $(CFLAGS_REL) -c $< -o $@

build-asan/%.o: src/%.c | build-asan
	$(CC) $(CFLAGS_ASAN) -c $< -o $@

build-intl/%.o: src/%.c | build-intl
	$(CC) $(CFLAGS_INTL) -c $< -o $@

# The sanitizers DO cover vendored code: a heap overflow in the regexp engine is a heap overflow in
# the compiled program, and finding it is the point of the ASan job.
build/vendor_%.o: %.c | build
	$(CC) $(CFLAGS_VENDOR) $(DEPFLAGS) -O2 -c $< -o $@

build-asan/vendor_%.o: %.c | build-asan
	$(CC) $(CFLAGS_VENDOR) $(DEPFLAGS) -O1 -g -fsanitize=address,undefined -c $< -o $@

build-intl/vendor_%.o: %.c | build-intl
	$(CC) $(CFLAGS_VENDOR) $(DEPFLAGS) -O2 -c $< -o $@

build build-asan:
	mkdir -p $@

# The ICU check lives on the directory every intl object waits for, so a host without ICU is told
# what to install instead of drowning in "unicode/ucol.h: No such file" once per object.
build-intl:
	@test -n '$(strip $(ICU_LIBS))' || { \
	  echo 'make intl: pkg-config cannot find icu-uc/icu-i18n.' >&2; \
	  echo '  macOS:  brew install icu4c && export PKG_CONFIG_PATH="$$(brew --prefix icu4c)/lib/pkgconfig"' >&2; \
	  echo '  Debian: apt install libicu-dev' >&2; \
	  exit 1; }
	mkdir -p $@

clean:
	rm -rf build build-asan build-intl

-include $(DEPS)
