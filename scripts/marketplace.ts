import { stableVersion } from './release-version.js';

export function stableMarketplace(packageName: string, version: string) {
  stableVersion.parse(version);
  return {
    name: 'arknights-reader',
    interface: { displayName: '方舟阅读器' },
    plugins: [
      {
        name: 'arknights-story-reader',
        source: {
          source: 'npm',
          package: packageName,
          version,
          registry: 'https://registry.npmjs.org',
        },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      },
    ],
  };
}

export function candidateMarketplace(packageName: string, version: string) {
  return {
    ...stableMarketplace(packageName, version),
    name: 'arknights-reader-candidate',
    interface: { displayName: '方舟阅读器候选验收' },
  };
}
