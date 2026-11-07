import { z } from 'zod';

const assetSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.string(),
  digest: z.string().nullable().optional(),
});
export const githubReleaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  html_url: z.url(),
  assets: z.array(assetSchema),
});
export type GithubRelease = z.infer<typeof githubReleaseSchema>;

export function githubReleases(
  repository: string,
  token: string | undefined,
  fetchGithub: typeof fetch = fetch,
) {
  if (!token)
    throw new Error('需要工作流的 GH_TOKEN，不使用本机凭据或长期 token。');
  z.string()
    .regex(/^[\w.-]+\/[\w.-]+$/u)
    .parse(repository);
  const request = async (url: string, init: RequestInit = {}) => {
    const response = await fetchGithub(url, {
      ...init,
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...init.headers,
      },
    });
    if (!response.ok)
      throw new Error(
        `GitHub ${init.method ?? 'GET'} ${new URL(url).pathname}: HTTP ${response.status}`,
      );
    return response;
  };
  const api = async (suffix: string, method = 'GET', body?: unknown) => {
    const response = await request(
      `https://api.github.com/repos/${repository}/${suffix}`,
      {
        method,
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
              headers: { 'Content-Type': 'application/json' },
            }),
      },
    );
    return response.json();
  };
  return {
    async hasArtifact(run: string) {
      const result = z
        .object({
          artifacts: z.array(
            z.object({ name: z.string(), expired: z.boolean() }),
          ),
        })
        .parse(await api(`actions/runs/${run}/artifacts?per_page=100`));
      return result.artifacts.some(
        (artifact) => artifact.name === 'release-package' && !artifact.expired,
      );
    },
    async find(tag: string) {
      // REST's tags endpoint omits drafts; list releases including drafts.
      for (let page = 1; ; page++) {
        const releases = z
          .array(githubReleaseSchema)
          .parse(await api(`releases?per_page=100&page=${page}`));
        const release = releases.find((item) => item.tag_name === tag);
        if (release) return release;
        if (releases.length < 100) return null;
      }
    },
    async get(id: number) {
      return githubReleaseSchema.parse(await api(`releases/${id}`));
    },
    async create(tag: string, source: string, body: string) {
      return githubReleaseSchema.parse(
        await api('releases', 'POST', {
          tag_name: tag,
          target_commitish: source,
          name: tag,
          draft: true,
          prerelease: false,
          body,
        }),
      );
    },
    async download(asset: z.infer<typeof assetSchema>) {
      if (asset.state !== 'uploaded')
        throw new Error(`附件尚未上传完成：${asset.name}`);
      const response = await request(
        `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`,
        {
          headers: { Accept: 'application/octet-stream' },
        },
      );
      return Buffer.from(await response.arrayBuffer());
    },
    async upload(id: number, name: string, bytes: Uint8Array) {
      const response = await request(
        `https://uploads.github.com/repos/${repository}/releases/${id}/assets?name=${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Blob([new Uint8Array(bytes)]),
        },
      );
      return assetSchema.parse(await response.json());
    },
  };
}
export type ReleaseStore = ReturnType<typeof githubReleases>;
