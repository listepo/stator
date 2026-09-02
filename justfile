# Stator C11 runtime → runtime/build/libjsrt.a (release), build-asan/, and
# build-intl/ (the ICU feature build, `just runtime-intl` — off by default).
# Generated C is never hand-edited; the archive is the codegen↔runtime contract's other half.
#
# Replaces runtime/Makefile. Incrementality is a timestamp walk of each .c and the -MMD
# sidecar the compiler writes: a header change still rebuilds, which is the load-bearing
# property (plan-notes 66). `CC` from the environment still wins; unset, it is clang.

set minimum-version := "1.50.0"
set shell := ["bash", "-cu"]

cc := env("CC", "clang")
ar := env("AR", "ar")
node := env("NODE", "node")

# QuickJS-NG's POSIX timing/path helpers are hidden by glibc's strict C11 headers unless the
# requested POSIX revision is declared before any system header. Apple's SDK selects different
# malloc/pthread declarations when that macro is present, so leave the macOS vendor flags untouched.
vendor_posix := if os() == "linux" { "-D_POSIX_C_SOURCE=200809L" } else { "" }

default:
    @just --list

# runtime/build/libjsrt.a (clang -O2, -Werror)
runtime:
    @just _runtime rel

# runtime/build-asan/libjsrt.a (-fsanitize=address,undefined -O1 -g)
runtime-asan:
    @just _runtime asan

# runtime/build-intl/libjsrt.a — ICU feature build (needs pkg-config icu-uc icu-i18n)
runtime-intl:
    @just _runtime intl

# Print corpus vs Node, byte-for-byte (the runtime's own tests)
runtime-test: runtime
    @just _runtime-test rel

# Same corpus, linked against the sanitized archive
runtime-test-asan: runtime-asan
    @just _runtime-test asan

runtime-clean:
    rm -rf runtime/build runtime/build-asan runtime/build-intl

# flavor is rel | asan | intl
[private]
_runtime flavor:
    #!/usr/bin/env bash
    set -euo pipefail
    cd runtime
    CC='{{cc}}'
    AR='{{ar}}'
    FLAVOR='{{flavor}}'
    VENDOR_POSIX='{{vendor_posix}}'
    VENDOR_INC='-Ivendor/quickjs-ng -Ivendor/fdlibm'
    CFLAGS_COMMON="-std=c11 -Wall -Wextra -Werror -Iinclude ${VENDOR_INC} -ffunction-sections -fdata-sections"
    CFLAGS_VENDOR="-std=c11 -Wall ${VENDOR_POSIX} -Iinclude ${VENDOR_INC} -ffunction-sections -fdata-sections"
    DEPFLAGS='-MMD -MP'

    # Boehm: the library flags are the capability signal (Debian's libgc-dev has no -I). This
    # must land on CFLAGS before the flavor-specific assignment, or -DJSRT_HAVE_BOEHM is dropped
    # and the malloc fallback is silently selected while we report "Boehm GC".
    BDW_CFLAGS="$(pkg-config --cflags bdw-gc 2>/dev/null || true)"
    BDW_LIBS="$(pkg-config --libs bdw-gc 2>/dev/null || true)"
    if [[ -n "${BDW_LIBS// }" ]]; then
      CFLAGS_COMMON="${CFLAGS_COMMON} -DJSRT_HAVE_BOEHM ${BDW_CFLAGS}"
      GC_LIBS="${BDW_LIBS}"
      GC_STATUS='Boehm GC'
    else
      GC_LIBS=''
      GC_STATUS='plain malloc (no collection)'
    fi
    SYS_LIBS='-lm'

    case "${FLAVOR}" in
      rel)
        DIR=build
        CFLAGS="${CFLAGS_COMMON} ${DEPFLAGS} -O2"
        VFLAGS="${CFLAGS_VENDOR} ${DEPFLAGS} -O2"
        EXTRA_LIBS="${GC_LIBS} ${SYS_LIBS}"
        LABEL='Runtime built with'
        ;;
      asan)
        DIR=build-asan
        CFLAGS="${CFLAGS_COMMON} ${DEPFLAGS} -O1 -g -fsanitize=address,undefined"
        VFLAGS="${CFLAGS_VENDOR} ${DEPFLAGS} -O1 -g -fsanitize=address,undefined"
        EXTRA_LIBS="${GC_LIBS} ${SYS_LIBS}"
        LABEL='Runtime (ASan) built with'
        ;;
      intl)
        ICU_CFLAGS="$(pkg-config --cflags icu-uc icu-i18n 2>/dev/null || true)"
        ICU_LIBS="$(pkg-config --libs icu-uc icu-i18n 2>/dev/null || true)"
        if [[ -z "${ICU_LIBS// }" ]]; then
          echo 'just runtime-intl: pkg-config cannot find icu-uc/icu-i18n.' >&2
          echo '  macOS:  brew install icu4c && export PKG_CONFIG_PATH="$(brew --prefix icu4c)/lib/pkgconfig"' >&2
          echo '  Debian: apt install libicu-dev' >&2
          exit 1
        fi
        DIR=build-intl
        # -DUCHAR_TYPE=uint16_t is ICU's own supported way to say UChar is the embedder's 16-bit
        # unit: JSString already holds uint16_t*, so the strings pass through without a copy.
        CFLAGS="${CFLAGS_COMMON} ${DEPFLAGS} -O2 -DJSRT_HAVE_ICU -DUCHAR_TYPE=uint16_t ${ICU_CFLAGS}"
        VFLAGS="${CFLAGS_VENDOR} ${DEPFLAGS} -O2"
        EXTRA_LIBS="${GC_LIBS} ${ICU_LIBS} ${SYS_LIBS}"
        LABEL='Runtime (Intl/ICU) built with'
        ;;
      *)
        echo "unknown runtime flavor: ${FLAVOR}" >&2
        exit 1
        ;;
    esac

    mkdir -p "${DIR}"

    stale() {
      local obj=$1 src=$2
      local dep="${obj%.o}.d"
      [[ -f ${obj} ]] || return 0
      [[ ${src} -nt ${obj} ]] && return 0
      [[ -f ${dep} ]] || return 0
      local f
      # -MMD writes `obj: src.h a.h \`; strip the target and the continuations, then each remaining
      # token is a path. A missing path is not newer — it is a deleted header, and the next compile
      # will fail loudly.
      for f in $(sed -e 's/^[^:]*://' -e 's/\\//g' "${dep}"); do
        [[ -n ${f} && -e ${f} && ${f} -nt ${obj} ]] && return 0
      done
      return 1
    }

    shopt -s nullglob
    objs=()
    for src in src/*.c; do
      obj="${DIR}/$(basename "${src%.c}").o"
      objs+=("${obj}")
      if stale "${obj}" "${src}"; then
        ${CC} ${CFLAGS} -c "${src}" -o "${obj}"
      fi
    done
    # Vendored objects get a vendor_ prefix so they cannot collide with a src/ file of the same
    # name in the flat build directory. Basenames must stay unique across vendor directories —
    # the prefix carries no directory — which is true today (libregexp/libunicode/fdlibm).
    # Vendored code compiles WITHOUT -Wextra -Werror: it is not ours to edit (plan-notes 101).
    # The sanitizers DO cover it: a heap overflow in the regexp engine is a heap overflow in
    # the compiled program.
    for src in vendor/*/*.c; do
      obj="${DIR}/vendor_$(basename "${src%.c}").o"
      objs+=("${obj}")
      if stale "${obj}" "${src}"; then
        ${CC} ${VFLAGS} -c "${src}" -o "${obj}"
      fi
    done

    ${AR} rcs "${DIR}/libjsrt.a" "${objs[@]}"
    # Recorded on the PHONY-equivalent recipe rather than the archive: installing bdw-gc changes
    # the answer without changing a .c file, and an archive compiled WITH Boehm linked WITHOUT
    # -lgc is an undefined-symbol error at the end of every compile (plan-notes 106).
    printf '%s\n' "${EXTRA_LIBS}" > "${DIR}/link-flags.txt"
    echo "${LABEL}: ${GC_STATUS}"

[private]
_runtime-test flavor:
    #!/usr/bin/env bash
    set -euo pipefail
    cd runtime
    CC='{{cc}}'
    NODE='{{node}}'
    FLAVOR='{{flavor}}'
    CORPORA=(print_numbers print_arrays print_objects print_maps print_shapes print_typeof print_regexp print_promise print_dates)

    VENDOR_INC='-Ivendor/quickjs-ng -Ivendor/fdlibm'
    CFLAGS_COMMON="-std=c11 -Wall -Wextra -Werror -Iinclude ${VENDOR_INC} -ffunction-sections -fdata-sections"
    BDW_CFLAGS="$(pkg-config --cflags bdw-gc 2>/dev/null || true)"
    BDW_LIBS="$(pkg-config --libs bdw-gc 2>/dev/null || true)"
    if [[ -n "${BDW_LIBS// }" ]]; then
      CFLAGS_COMMON="${CFLAGS_COMMON} -DJSRT_HAVE_BOEHM ${BDW_CFLAGS}"
      GC_LIBS="${BDW_LIBS}"
    else
      GC_LIBS=''
    fi
    SYS_LIBS='-lm'
    DEPFLAGS='-MMD -MP'

    case "${FLAVOR}" in
      rel) DIR=build; CFLAGS="${CFLAGS_COMMON} ${DEPFLAGS} -O2"; TAG='runtime: print corpus matches Node' ;;
      asan) DIR=build-asan; CFLAGS="${CFLAGS_COMMON} ${DEPFLAGS} -O1 -g -fsanitize=address,undefined"; TAG='runtime: print corpus matches Node (ASan/UBSan)' ;;
      *) echo "unknown test flavor: ${FLAVOR}" >&2; exit 1 ;;
    esac

    for corpus in "${CORPORA[@]}"; do
      ${CC} ${CFLAGS} "tests/${corpus}.c" -L"${DIR}" -ljsrt ${GC_LIBS} ${SYS_LIBS} -o "${DIR}/${corpus}"
      ${NODE} "tests/${corpus}.mjs" > "${DIR}/${corpus}.expected.txt"
      "./${DIR}/${corpus}" > "${DIR}/${corpus}.actual.txt"
      diff -u "${DIR}/${corpus}.expected.txt" "${DIR}/${corpus}.actual.txt"
    done
    echo "${TAG}"
