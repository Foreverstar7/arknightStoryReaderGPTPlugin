import { Buffer } from 'buffer/';
// The unmodified data readers use Buffer only for bounded bytes and base64.
// Use the maintained browser implementation rather than reimplementing codecs.
Object.defineProperty(globalThis, 'Buffer', {
  value: Buffer,
  configurable: true,
});
