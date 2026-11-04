import type { Block, Leaf } from '../shared/contracts.js';
import type { ScriptScene as Scene } from './prts-cg.js';

type Path = { value: string; labels: string[]; scene: Scene; active: boolean };

/** PRTS's player keeps the last selected value; Predicate changes which paths
 * execute, and a conditional Decision replaces only those paths' values.
 * Keep complex flow in source order as labelled groups, so overlapping/nested
 * continuations are emitted once rather than copied into multiple branches.
 * Source: Widget:ScenarioSimulator, decision/predicate and LOG ALL handlers.
 */
export class ScriptFlow {
  private paths: Path[] = [
    { value: '', labels: [], scene: { slots: [] }, active: true },
  ];
  private known = new Set<string>();
  private segment: Leaf[] | null = null;
  constructor(
    private readonly blocks: Block[],
    private readonly identify: (value: string) => string,
    private readonly merge: (scenes: Scene[]) => Scene,
    private readonly fail: (message: string) => never,
    private readonly report: (message: string) => void,
  ) {}
  scene(): Scene {
    return this.merge(
      this.paths.filter((path) => path.active).map((path) => path.scene),
    );
  }
  update(change: (scene: Scene) => Scene) {
    for (const path of this.paths)
      if (path.active) path.scene = change(structuredClone(path.scene));
  }
  decision(labels: string[], values: string[]) {
    for (const value of values) this.known.add(value);
    const active = this.paths.filter((path) => path.active);
    if (!active.length) this.fail('Decision 没有可到达的分支。');
    const conditional = active.length !== this.paths.length;
    const when = conditional
      ? active.flatMap((path) => path.labels)
      : undefined;
    this.blocks.push({
      id: this.identify(`choice:${labels.join(';')}`),
      kind: 'choices',
      options: labels.map((label) => ({ label, blocks: [] })),
      ...(when ? { when } : {}),
    });
    const scene = this.scene();
    this.paths = [
      ...this.paths.filter((path) => !path.active),
      ...labels.map((label, index) => {
        const value = values[index];
        if (value === undefined) return this.fail('Decision 缺少选项值。');
        return {
          value,
          labels: when ? when.map((parent) => `${parent} → ${label}`) : [label],
          scene: structuredClone(scene),
          active: true,
        };
      }),
    ];
    this.segment = null;
  }
  predicate(raw: string | undefined) {
    if (raw === '') this.fail('Predicate 的 references 为空，无法确定分支。');
    const references = raw?.split(';').map((value) => value.trim());
    if (!this.known.size)
      this.fail('Predicate 引用了没有可对应 Decision 的选项。');
    if (references?.some((value) => !/^[1-9]\d*$/u.test(value)))
      this.fail('Predicate 的条件值格式不兼容。');
    for (const path of this.paths)
      path.active = references === undefined || references.includes(path.value);
    if (!this.paths.some((path) => path.active)) {
      // A source typo/unreachable value must not erase its prose or acquire a
      // guessed option label. Keep a labelled, isolated source segment instead.
      const value = references?.join(';') ?? '';
      const label = `源脚本条件 ${value}（未能关联到可到达选项）`;
      this.report(label);
      this.paths.push({
        value,
        labels: [label],
        scene: { slots: [] },
        active: true,
      });
    }
    this.segment = null;
  }
  add(leaf: Leaf) {
    const active = this.paths.filter((path) => path.active);
    if (active.length === this.paths.length) {
      this.blocks.push(leaf);
      return;
    }
    if (!this.segment) {
      const labels = [...new Set(active.flatMap((path) => path.labels))];
      this.segment = [];
      this.blocks.push({
        id: this.identify(`paths:${labels.join(';')}`),
        kind: 'choices',
        options: [],
        shared: [{ labels, blocks: this.segment }],
      });
    }
    this.segment.push(leaf);
  }
}
