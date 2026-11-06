import { FixtureSource } from '../data/fixture.js';
import { PrtsSource } from '../data/prts.js';
import { readerDataRoot, startReader } from './start.js';

const dataRoot = readerDataRoot();
const sourceMode = process.env.READER_SOURCE ?? 'prts';
if (!['prts', 'fixture'].includes(sourceMode))
  throw new Error('READER_SOURCE 只能为 prts 或 fixture。');
await startReader(
  sourceMode === 'fixture' ? new FixtureSource() : new PrtsSource(dataRoot),
  dataRoot,
  sourceMode,
);
