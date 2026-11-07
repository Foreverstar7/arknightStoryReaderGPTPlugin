import { ReaderError } from '../../src/shared/errors.js';

export interface DemoAsset {
  id: string;
  url: string;
}
export interface DemoRaster {
  width: number;
  height: number;
  dataUrl: string;
}
export type DemoImageLoader = (asset: DemoAsset) => Promise<DemoRaster>;

// Approved local artwork, never guessed PRTS URLs. Keep the order aligned with
// data.ts; source images, selection and prompts live in docs/design/website-covers.
export const coverAssets: DemoAsset[] = [
  {
    id: 'lone-trail',
    url: new URL('../assets/cover-lone-trail.webp', import.meta.url).href,
  },
  {
    id: 'near-light',
    url: new URL('../assets/cover-near-light.webp', import.meta.url).href,
  },
  {
    id: 'babel',
    url: new URL('../assets/cover-babel.webp', import.meta.url).href,
  },
  {
    id: 'stultifera-navis',
    url: new URL('../assets/cover-stultifera-navis.webp', import.meta.url).href,
  },
  {
    id: 'il-siracusano',
    url: new URL('../assets/cover-il-siracusano.webp', import.meta.url).href,
  },
  {
    id: 'so-long-adele',
    url: new URL('../assets/cover-so-long-adele.webp', import.meta.url).href,
  },
];
export const rabbitAsset: DemoAsset = {
  id: 'animal-rabbit',
  url: new URL('../assets/rabbit-portrait.webp', import.meta.url).href,
};

export const loadDemoRaster: DemoImageLoader = async (asset) => {
  let response: Response;
  try {
    response = await fetch(asset.url);
  } catch (cause) {
    throw new ReaderError('network', '演示图片请求失败，请重试。', asset.url, {
      cause,
    });
  }
  if (!response.ok)
    throw new ReaderError(
      response.status === 404 ? 'resource_missing' : 'network',
      `演示图片读取失败（HTTP ${response.status}），请重试。`,
      asset.url,
    );
  const blob = await response.blob();
  if (!['image/webp', 'image/png'].includes(blob.type) || blob.size > 4_000_000)
    throw new ReaderError('parse', '演示图片的格式或大小不兼容。', asset.url);
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Invalid raster data URL'));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
  } catch (cause) {
    throw new ReaderError('parse', '演示图片解码失败，请重试。', asset.url, {
      cause,
    });
  }
};
