# 剧情封面系列 · 生成提示词

2026-11-07。使用内置 image_gen，不使用 CLI。第一张《孤星》沿用用户认可的原图，完整提示词见 [原试稿记录](LONE-TRAIL-PROMPT.md)；其余仅把这张原创试图作为画风参考，不输入官方图片。以下保存新五张及《巴别塔》定向修正的全部实际提示词。

## 第一批

### 长夜临光

- 输出：`near-light-line-cover-v1.png`
- 风格参考：`lone-trail-line-cover-v1.png`

```text
Use case: illustration-story. Create ONE landscape 16:9 story-cover illustration, not a collage, mockup or page. The attached image is the APPROVED STYLE REFERENCE ONLY: match its crisp ivory ink linework, restrained silkscreen texture, flat dark ground, confident silhouettes, sparse detail, generous negative space and small-card legibility. Do not reuse its observatory, planets, orbital rings, building arrangement or beam composition. This is a new symbolic fan illustration for an Arknights story-reader cover series; make a new composition, not a copy or tracing of any official promotional image or CG. Strong shape hierarchy and at least 35% quiet negative space. A few flat ink colors, subtly hand-drawn edges, no realistic painted lighting or 3D. No text, letters, numbers, logo, official insignia, watermark, borders, UI, or book mockup. Main silhouettes must remain clear at 320px wide, inside crop-safe margins.
Subject: Arknights Near Light / 长夜临光, the commercial knight city of Kazimierz and a solitary radiant knight. Modern high-rise city silhouettes and a simplified elliptical tournament stadium recede across the middle distance. In the foreground near the left third stands a small spear-bearing armored knight with a short cape, in a calm resolved stance, seen from behind; suggest an equine-eared female knight without portrait detail. One clean diagonal ribbon of golden light from the spear crosses upward through the night, becoming the image's distinctive gesture. The sky stays mostly empty. This is a modern industrial tournament city, not a medieval castle or fairy-tale kingdom.
Composition: low eye level, small foreground knight on the left, stadium and a few sharp high-rise outlines across the lower half, sweeping diagonal golden spear-light balancing the right. Clear foreground, middle distance and sky; no crowded battle or character closeup. Keep the knight small like the human scale marker in the reference, not a full character poster.
Palette: nearly black charcoal-blue ground, warm ivory architecture and silhouette edges, restrained bright amber-gold ONLY along the spear and its light. Mood: integrity and a personal ideal holding its ground against a vast glittering city. Match the reference's elegance and detail density, with a distinctly different diagonal composition.
```

### 巴别塔

- 输出：`babel-line-cover-v1.png`
- 风格参考：`lone-trail-line-cover-v1.png`

```text
Use case: illustration-story. Create ONE landscape 16:9 story-cover illustration, not a collage, mockup or page. The attached image is the APPROVED STYLE REFERENCE ONLY: match its crisp ivory ink linework, restrained silkscreen texture, flat dark ground, confident silhouettes, sparse detail, generous negative space and small-card legibility. Do not reuse its observatory, planets, orbital rings, building arrangement or beam composition. This is a new symbolic fan illustration for an Arknights story-reader cover series; make a new composition, not a copy or tracing of any official promotional image or CG. Strong shape hierarchy and at least 35% quiet negative space. A few flat ink colors, subtly hand-drawn edges, no realistic painted lighting or 3D. No text, letters, numbers, logo, official insignia, watermark, borders, UI, or book mockup. Main silhouettes must remain clear at 320px wide, inside crop-safe margins.
Subject: Arknights Babel / 巴别塔, expressed through the contrast of fragile white flowers and an enormous wandering landship. This is the game's Babel organization and its tragic ideal, NOT the biblical Tower of Babel. Do not draw a spiral tower.
Foreground: a small beautifully simplified cluster of white flowers growing between fractured dark mineral facets. Give the flower silhouette enough scale and clarity to read at thumbnail size; five or six blossoms, not an ornate garden. In the middle distance, across a low desolate ridge, a long, angular industrial mobile landship is seen in side profile, with a blunt armored hull, a small number of rectangular upper structures and thin antenna masts. It should read as a vast travelling shelter on land, NOT a cruise ship, sailing ship or medieval fortress. No wheels need to be shown. A few detached petals drift into the surrounding negative space.
Composition: low horizontal landship silhouette stretching across the left-middle; the foreground flower cluster near the right third, quietly lit by a single thin muted rose glow. The upper half stays spacious and dark. Flower and vessel are the two main shapes. No chessboard, weapons, close-up character, crosses or literal biblical iconography.
Palette: charcoal-plum black ground, pale ivory ink for flowers and industrial outlines, a very small amount of dusty rose-pink for petals and the light. Keep ivory as warm and luminous as in the reference, no large pink wash. Mood: tenderness, refuge, memory and loss, restrained rather than melodramatic. Use the same sparse ink-poster craft as the reference.
```

### 巴别塔二版修正（当前采用）

- 输出：`babel-line-cover-v2.png`
- 编辑目标：`babel-line-cover-v1.png`
- 修正海船误读及重复的光柱，保留花、配色与构图。

```text
Use case: precise-object-edit. Edit this existing Babel story-cover illustration with TWO focused corrections, keeping its 16:9 framing, dark plum-black and ivory ink-poster style, flower cluster, petals, foreground rocks, negative space and all other composition unchanged.
1. Replace ONLY the distant low naval-looking vessel with an enormous INDUSTRIAL CRAWLER LANDSHIP inspired by the idea of Arknights' Rhodes Island mobile base, newly drawn rather than copying a game image. Keep the same left-middle location and roughly the same horizontal width. It must visibly travel on DRY ROCKY LAND: a thick rectangular armored slab hull elevated over several massive dark crawler-track assemblies, a tall blocky central superstructure and a few utilitarian industrial masts. A fortress-like traveling industrial habitat, not a destroyer, yacht or sailing ship. Remove the pointed boat bow, waterline hull shape, any smoke/wake along the ground and any naval-style gun turrets. Show solid terrain beneath the tracks. The final vessel should have a more substantial upright mass than the current thin ocean ship while remaining secondary to the flowers.
2. Remove the thin vertical pink light beam above the flowers. Keep only a very subtle dusty rose accent at petal edges and flower stamens.
Preserve the flowers exactly as they are; do not replace them with roses, increase their number or move them. Keep the quiet emotional tone. Do not add text, logos, official insignias, borders, additional characters or objects.
```

## 第二批

### 愚人号

- 输出：`stultifera-navis-line-cover-v1.png`
- 风格参考：`lone-trail-line-cover-v1.png`

```text
Use case: illustration-story. Create ONE landscape 16:9 story-cover illustration, not a collage, mockup or page. The attached image is the APPROVED STYLE REFERENCE ONLY: match its crisp ivory ink linework, restrained silkscreen texture, flat dark ground, confident silhouettes, sparse detail, generous negative space and small-card legibility. Do not reuse its observatory, planets, orbital rings, building arrangement or beam composition. This is a new symbolic fan illustration for an Arknights story-reader cover series; make a new composition, not a copy or tracing of any official promotional image or CG. Strong shape hierarchy and at least 35% quiet negative space. A few flat ink colors, subtly hand-drawn edges, no realistic painted lighting or 3D. No text, letters, numbers, logo, official insignia, watermark, borders, UI, or book mockup. Main silhouettes must remain clear at 320px wide, inside crop-safe margins.
Subject: Arknights Stultifera Navis / 愚人号, an ancient golden flagship emerging from a silent sea. A vast, weathered, ornate ocean-going flagship occupies the middle-right, its high armored side and stacked arched superstructure defined by a few striking ivory/gold structural outlines. It feels like a lost monument to a maritime civilization: imposing, old and proud, not a modern grey destroyer and not a cute pirate ship. Suggest ribs, long galleries, two tall masts and a heavy bow, but avoid intricate clutter or flags. No exact official vessel blueprint is being reproduced.
A tiny distant lighthouse near the far-left horizon projects one restrained near-horizontal pale-gold light through the sea mist toward the vessel. Thin simplified wave contours cross the bottom quarter; low, long bands of negative-space mist partly obscure the hull. No stars, moon, orbital rings, lighthouse closeup, vertical energy beam, tentacles or dramatic sea monster.
Composition: a broad HORIZONTAL composition, low sea-level viewpoint, massive ship on the right balanced by tiny left lighthouse, fog and empty upper sky. No close foreground character.
Palette: deep green-blue black ground, warm ivory ink, restrained tarnished antique gold on the ship edges and one lighthouse ray. Quiet eerie scale and dignity, not a loud action scene. Match the approved reference's sparse silkscreen ink craft and legible silhouette.
```

### 叙拉古人

- 输出：`il-siracusano-line-cover-v1.png`
- 风格参考：`lone-trail-line-cover-v1.png`

```text
Use case: illustration-story. Create ONE landscape 16:9 story-cover illustration, not a collage, mockup or page. The attached image is the APPROVED STYLE REFERENCE ONLY: match its crisp ivory ink linework, restrained silkscreen texture, flat dark ground, confident silhouettes, sparse detail, generous negative space and small-card legibility. Do not reuse its observatory, planets, orbital rings, building arrangement or beam composition. This is a new symbolic fan illustration for an Arknights story-reader cover series; make a new composition, not a copy or tracing of any official promotional image or CG. Strong shape hierarchy and at least 35% quiet negative space. A few flat ink colors, subtly hand-drawn edges, no realistic painted lighting or 3D. No text, letters, numbers, logo, official insignia, watermark, borders, UI, or book mockup. Main silhouettes must remain clear at 320px wide, inside crop-safe margins.
Subject: Arknights Il Siracusano / 叙拉古人, the rain season, wolves, grand theater and the weight of the old families. A narrow rain-soaked Italianate urban stairway recedes toward an empty grand theater entrance with a strong arched doorway and just a few tall columns. In the lower foreground, a tiny dark wolf-eared female sword-bearer in a practical long coat is seen from behind walking away from the doorway; keep facial features absent and the figure small, not a character portrait. On a broad adjacent wall, a single oversized sharp WOLF-PROFILE SHADOW is the main graphic shape. This shadow should be readable as a wolf, not a dog or human face. A small strip of muted wine-red theater curtain and its thin reflected color in a puddle are the sole color accent. The wolf shadow, theater arch and wet stairway are the three distinctive elements.
Composition: an asymmetric, angular STREET-PERSPECTIVE design, foreground stair diagonals leading inward, one big flat wall/shadow mass balanced by sparse architecture. Express rain with a few thin controlled streaks and puddle contour lines, not a dense noise texture. The curtain is just a glimpse at the doorway, not a border framing the whole image.
Palette: soot-charcoal black ground, warm ivory architectural lines, a small amount of desaturated wine-red. Noir, restrained, cinematic but graphic; not a generic medieval European town, not a photorealistic film still. No guns, gore, text, mafia logos, roses, moons or light beams. Preserve the reference's economy of line and clear 320px thumbnail hierarchy.
```

### 火山旅梦

- 输出：`so-long-adele-line-cover-v1.png`
- 风格参考：`lone-trail-line-cover-v1.png`

```text
Use case: illustration-story. Create ONE landscape 16:9 story-cover illustration, not a collage, mockup or page. The attached image is the APPROVED STYLE REFERENCE ONLY: match its crisp ivory ink linework, restrained silkscreen texture, flat dark ground, confident silhouettes, sparse detail, generous negative space and small-card legibility. Do not reuse its observatory, planets, orbital rings, building arrangement or beam composition. This is a new symbolic fan illustration for an Arknights story-reader cover series; make a new composition, not a copy or tracing of any official promotional image or CG. Strong shape hierarchy and at least 35% quiet negative space. A few flat ink colors, subtly hand-drawn edges, no realistic painted lighting or 3D. No text, letters, numbers, logo, official insignia, watermark, borders, UI, or book mockup. Main silhouettes must remain clear at 320px wide, inside crop-safe margins.
Subject: Arknights So Long, Adele / 火山旅梦, a warm, strange seaside dream with soft pink sheep and a quiet volcanic landscape. The emotional counterpoint of this six-cover set: gently hopeful, reflective and a little whimsical rather than epic or ominous.
Scene: a broad, simple volcano silhouette and low seaside spa-town roofs in the distance; the mountain has only a wisp of curling WHITE steam, no violent eruption, red lava or disaster. A lightly outlined waterside promenade and curved handrail occupy the lower edge. Three rounded SHEEP-SHAPED CLOUDS, with small curled horns and tiny simple faces, drift upward from the promenade across one side of the scene; one larger fluffy sheep shape anchors the lower third and two much smaller ones drift farther away. The sheep have a soft coral-pink accent and ivory fluffy outlines. Do not make a crowd of cute mascots or add a human character. A few steam/cloud curves visually connect the sheep with the far volcano.
Composition: a calm open horizontal landscape with the sheep/cloud group rising on one side, a very low horizon, a simple clean mountain profile, and generous clear dawn sky. Quiet contours, large flat areas, readable as a small story cover.
Palette variation within the approved ink-poster family: use a muted warm dusty-rose/mauve mid-dark flat ground, pale ivory linework and silhouettes, darker plum structural ink where needed, with restrained warm coral-pink sheep accents. It should be noticeably warmer and slightly lighter than the reference, while retaining its silkscreen texture, confident outlines and disciplined limited-color look. No gradients, glossy shading, detailed fur, saturated candy colors, scattered stars, moons, orbital rings, energy beams, umbrellas, labels or logos.
```
