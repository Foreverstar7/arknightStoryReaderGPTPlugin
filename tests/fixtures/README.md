# 测试输入

- `raster.json`：用于格式／解码检查的合成小图片。
- `prts-image-baseline.json`：图片探针、离线回放与浏览器测试共用的固定资源引用和篇目标识，不含正文或游戏图片字节。

图片样本保留曾触发映射或组合问题的案例。`failures` 和 `cgOmissions` 是选择回归输入的字段名，不表示这些资源当前失败；审计命令不自动更新该文件。

需要增减案例时，同时核对 `probe-prts-body-images.ts`、`refactoring-baseline.ts` 和 `prts-body-images.spec.ts` 的使用范围，保留人物与三种静态 CG 组合的覆盖。
