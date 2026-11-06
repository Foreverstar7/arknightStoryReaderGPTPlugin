// Reader image/transport budgets, not assertions about PRTS's source format.
// Origins and maintenance: docs/maintenance.md (image and transport budgets).
// Recheck stream boundaries, composition schemas and real stdio
// together when changing these values or the SDK/host message limit.
export const MAX_IMAGE_BYTES = 20_000_000; // User-approved original raster bytes.
export const MAX_IMAGE_LAYERS = 32; // Both source composition and rendered result.
export const MAX_COMPOSITION_CHARACTERS = 60_000_000; // Sum of raster data URL lengths.

// A 20 MB original encodes to ~26.7M base64 characters. Each JSON segment's
// 1M characters occupy at most 4 MB UTF-8, below the SDK's 10 MiB stdio buffer.
// 64 segments retain 4M characters of headroom beyond the raster budget for
// geometry/metadata. The server still checks the actual serialized result.
export const IMAGE_PART_CHARACTERS = 1_000_000;
export const MAX_IMAGE_PARTS = 64;
