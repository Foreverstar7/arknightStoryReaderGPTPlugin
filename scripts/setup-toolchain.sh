#!/bin/sh
set -eu
. "$(dirname -- "$0")/toolchain-unix.sh"

mkdir -p "$reader_toolchain"
if [ ! -x "$reader_node" ]; then
  command -v curl >/dev/null || { printf '%s\n' 'curl is required.' >&2; exit 1; }
  command -v tar >/dev/null || { printf '%s\n' 'tar is required.' >&2; exit 1; }
  if command -v sha256sum >/dev/null; then
    reader_checksum=sha256sum
  elif command -v shasum >/dev/null; then
    reader_checksum=shasum
  else
    printf '%s\n' 'sha256sum or shasum is required.' >&2
    exit 1
  fi
  reader_download=$(mktemp -d "$reader_toolchain/.download.XXXXXX")
  trap 'rm -f "$reader_download/SHASUMS256.txt" "$reader_download/node.tar.gz"; rmdir "$reader_download"' 0
  trap 'exit 1' HUP INT TERM
  reader_url="https://nodejs.org/dist/v$reader_node_version"
  printf 'Downloading official Node.js %s (%s/%s)...\n' "$reader_node_version" "$reader_platform" "$reader_arch"
  curl -fLSs --connect-timeout 20 --max-time 60 "$reader_url/SHASUMS256.txt" -o "$reader_download/SHASUMS256.txt"
  reader_expected=$(awk -v filename="$reader_distribution.tar.gz" '$2 == filename { print $1 }' "$reader_download/SHASUMS256.txt")
  if [ "${#reader_expected}" -ne 64 ]; then
    printf '%s\n' 'Official checksum entry is missing or ambiguous.' >&2
    exit 1
  fi
  case "$reader_expected" in
    *[!0-9a-f]*) printf '%s\n' 'Invalid official checksum.' >&2; exit 1 ;;
  esac
  curl -fLSs --connect-timeout 20 --max-time 300 "$reader_url/$reader_distribution.tar.gz" -o "$reader_download/node.tar.gz"
  if [ "$reader_checksum" = sha256sum ]; then
    reader_actual=$(sha256sum "$reader_download/node.tar.gz" | cut -d ' ' -f 1)
  else
    reader_actual=$(shasum -a 256 "$reader_download/node.tar.gz" | cut -d ' ' -f 1)
  fi
  if [ "$reader_actual" != "$reader_expected" ]; then
    printf '%s\n' 'Official Node archive checksum mismatch. Nothing will be executed.' >&2
    exit 1
  fi
  tar -xzf "$reader_download/node.tar.gz" -C "$reader_toolchain"
fi

PATH="$reader_runtime/bin:$PATH"
export PATH
reader_npm_version=$("$reader_node" -e 'const p = require(process.argv[1]); if (!/^npm@\d+\.\d+\.\d+$/.test(p.packageManager)) throw Error("Pin an exact stable npm version"); console.log(p.packageManager.slice(4));' "$reader_project_root/package.json")
if [ "$("$reader_node" "$reader_npm" --version)" != "$reader_npm_version" ]; then
  "$reader_node" "$reader_npm" install --global "npm@$reader_npm_version" --prefix "$reader_runtime" --fetch-retries=0 --fetch-timeout=20000
fi
"$reader_node" --version
"$reader_node" "$reader_npm" --version
