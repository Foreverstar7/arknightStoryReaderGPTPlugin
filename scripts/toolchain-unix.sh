# Shared by setup-toolchain.sh and npm.sh; invoke those entry points with sh.
# Official Node archive names/layouts: https://nodejs.org/dist/ (SHASUMS256.txt).
reader_project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
reader_node_version=$(tr -d '\r\n' < "$reader_project_root/.node-version")
if ! printf '%s\n' "$reader_node_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  printf '%s\n' 'The pinned Node version must be an exact stable version.' >&2
  exit 1
fi
case "$(uname -s)" in
  Darwin) reader_platform=darwin ;;
  Linux) reader_platform=linux ;;
  *) printf '%s\n' 'Use setup-toolchain.ps1 / npm.ps1 on Windows. Other systems are not supported.' >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) reader_arch=x64 ;;
  arm64|aarch64) reader_arch=arm64 ;;
  *) printf '%s\n' 'Only x64 and ARM64 are targeted.' >&2; exit 1 ;;
esac
reader_distribution="node-v$reader_node_version-$reader_platform-$reader_arch"
reader_toolchain="$reader_project_root/.local/toolchain"
reader_runtime="$reader_toolchain/$reader_distribution"
reader_node="$reader_runtime/bin/node"
reader_npm="$reader_runtime/lib/node_modules/npm/bin/npm-cli.js"
