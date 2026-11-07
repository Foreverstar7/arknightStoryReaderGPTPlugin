# 卡通动物兔子素材

2026-11-07。用户要求“亲自试试”中的人物图改成与《孤星》及六张封面协调的兔子，并明确纠正为**动物体态、卡通可爱、不采用人形**。当前采用 `rabbit-cartoon.png`；`animal-rabbit-study.png` 仅保留为最终简化编辑的输入，不用于页面。人形候选未接入。

- 内置 image_gen 生成与编辑，未使用 CLI、模型 API key 或官方图片输入。风格参考为 `../website-covers/lone-trail-line-cover-v1.png`。
- 自然坐姿、四足、长耳、短尾；只用细项圈上的蓝色菱形与小银环作阿米娅元素。项圈／戒环位置是本次兔子设计的转译，并非声称原作造型如此。
- [PRTS 阿米娅档案](https://prts.wiki/w/Amiya)核对角色背景；[阿米娅（医疗）语音](https://prts.wiki/w/%E5%A5%B6%E5%85%94)核对戒指与约束／祝福的关系。未复制对白或官方立绘。
- 最终 PNG 保留真实透明通道。网页只加载等比缩小至 768×768 的 `../../../website/assets/rabbit-portrait.webp`，颜色／轮廓不另行修改。
- 用于角色占位符 A／B 及分支里的同类角色，是同一张替身示意图；匿名“？？？”继续使用中性占位，不推定身份。
- 六张既有封面同时作为网页封面与原位场景示意；目录、篇目、正文、角色文案均为占位符，与原作剧情和角色对白无关。只访问打包静态资源。

## 完整提示词与参考关系

### 动物体态输入

风格参考：`../website-covers/lone-trail-line-cover-v1.png`；输出：`animal-rabbit-study.png`。

```text
Use case: illustration-story.
Create ONE new transparent-background illustration, preferably 1024 x 1024, of an ordinary ANIMAL RABBIT with natural rabbit anatomy and body proportions. This is a quadrupedal pet/wild rabbit, NOT an anthropomorphic character.
STYLE REFERENCE: use the attached Lone Trail cover only for restrained ivory ink contours, deep blue-black flat ink shadows, sparse silkscreen hatching and one tiny muted amber accent. Do NOT borrow the sky, observatory, or rectangular ground.
ANIMAL: a calm ivory-furred rabbit sitting in a natural low crouch on its haunches, seen in three-quarter side view. Horizontal compact oval torso, natural small rabbit head, two long upright ears, short front forelegs resting directly on the ground, large folded hind haunches and small round fluffy tail. Tiny natural dark eyes with a subtle cool-blue highlight, small nose and delicate whiskers. Anatomically rabbit, all the way.
SUBTLE AMIYA MOTIFS: a narrow dark collar carrying one tiny muted-cyan diamond pendant and a small cluster of slender silver ring charms. These are simple animal accessories translating Amiya's ring motif; keep them visibly small. No human fingers or ringed human hands.
COMPOSITION: entire animal centered, ears and tail and paws all visible, generous transparent margins. The rabbit itself occupies most of the frame. Low natural animal pose, NOT standing upright.
STYLE: simple, elegant editorial line illustration matching the reference cover's quiet graphic language. Opaque warm ivory fur, dark blue-black contour and tiny flat shadow shapes, very restrained texture, no photorealism, no 3D, no glossy doll styling. Crisp legibility when small, solid pale fur that works against both dark and light web UI.
STRICT EXCLUSIONS: NO human body, human arms, human hands, human legs, upright humanoid stance, coat, jacket, dress, sleeves, shoes, gloves, hair, staff, weapons, character costume or giant head chibi. No scenery, floor, shadows or background glow.
BACKGROUND: actual transparent alpha everywhere around the rabbit, not a colored rectangle, no gray halo, no black backdrop, no baked-in checkerboard. No words, logos, borders or watermarks.
```

### 最终卡通简化

编辑输入：`animal-rabbit-study.png`；输出：`rabbit-cartoon.png`；`transparent_background: true`。

```text
Edit this animal rabbit illustration into a noticeably CUTER, SIMPLER CARTOON RABBIT for a small reader character popup.
Keep: an actual four-legged animal rabbit sitting naturally on its haunches, ivory fur, deep blue-black linework, long ears, tiny cyan diamond pendant and small silver ring charms on its narrow collar, fully transparent background.
Change: make the compact body rounder and fluffier, the little head slightly larger relative to the body, cheeks soft and rounded, forepaws very short and neatly paired, ears a little shorter with soft round tips, bright large round friendly eyes with small white highlights, tiny curved mouth and a warm gentle expression. A slight shy head tilt is welcome. Keep natural rabbit forelegs and hind haunches; do not introduce human hands, fingers, clothes or upright humanoid anatomy.
Simplify the drawing substantially: remove almost all realistic fur strokes and crosshatching, retain only a few clean expressive contours and two or three small flat dark ink shadow shapes. Cute storybook / simple editorial silkscreen cartoon, not realistic animal anatomy study and not 3D toy. Calm and tasteful, harmonizing with deep blue-black, ivory and restrained gold line-art covers.
Frame the full animal with generous transparent margins; show both ears, paws and small round tail. One rabbit only. No floor, shadow, halo, environment, text, logos, border or checkerboard. Preserve actual transparency.
```

