#!/bin/sh
# What CI runs, runnable locally (plan.md §4 Task 1.0 step 10).
# Until the repo has a remote, this script IS the CI.
set -eu

echo "node:  $(node --version)"
echo "clang: $(clang --version | head -1)"
echo "os:    $(uname -srm)"
echo

pnpm install --frozen-lockfile
pnpm run ci

# Second job: the sanitized runtime build. Golden tests run against this once Phase 2
# lands them (plan.md §5 Task 2.7).
make -C runtime asan
