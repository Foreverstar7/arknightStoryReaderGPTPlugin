#!/usr/bin/env node
// npm/npx is a host entry point. Keep data outside its replaceable install/cache.
process.argv.push('--stdio', '--installed');
await import('./production.js');
export {};
