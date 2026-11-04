#!/bin/sh
set -eu
. "$(dirname -- "$0")/toolchain-unix.sh"
if [ ! -x "$reader_node" ] || [ ! -f "$reader_npm" ]; then
  printf '%s\n' 'Run sh scripts/setup-toolchain.sh first, or use your version manager with .node-version.' >&2
  exit 1
fi
PATH="$reader_runtime/bin:$PATH"
export PATH
exec "$reader_node" "$reader_npm" "$@"
