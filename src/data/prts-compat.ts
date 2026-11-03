/** Reviewed source-only commands with no reader text. This is deliberately a
 * bounded allowlist, not a fuzzy spelling correction or unknown-command fallback.
 * PRTS ScenarioSimulator/StoryPlayer skip these unsupported commands. Keep a
 * diagnostic rather than inventing character changes or guessing their intent.
 * Sources, signatures and maintenance checks: docs/prts-compatibility-0.1.21.md.
 */
const sourceNoops: Record<string, readonly string[]> = {
  daley: ['time'],
  dealy: ['time'],
  delau: ['time'],
  delat: ['time'],
  delayt: ['time'],
  palysound: ['name', 'volume'],
  musicvolune: ['volume', 'fadetime'],
  stopmucis: ['fadetime'],
  chaa: [],
  dialo: [],
  dialogs: [],
  charslsot: [],
  duration: [],
  glitchtween: ['slot', 'glitchto', 'duration'],
  consumeguideonstoryend: ['target', 'subsignal', 'showanyway'],
  usewhiteloadingmaskonfinish: [],
};
export function isReviewedSourceNoop(
  name: string,
  args: Record<string, string>,
  trailing: string,
): boolean {
  const keys = Object.hasOwn(sourceNoops, name) ? sourceNoops[name] : undefined;
  return (
    keys !== undefined &&
    !trailing &&
    Object.keys(args).every((key) => keys.includes(key))
  );
}
