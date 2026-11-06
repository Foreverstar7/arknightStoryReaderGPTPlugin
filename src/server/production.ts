import { PrtsSource } from '../data/prts.js';
import { readerDataRoot, startReader } from './start.js';

if (process.env.READER_SOURCE && process.env.READER_SOURCE !== 'prts')
  throw new Error('正式包仅支持 PRTS；fixture 请使用源码或开发来源。');
const dataRoot = readerDataRoot();
await startReader(new PrtsSource(dataRoot), dataRoot, 'prts');
