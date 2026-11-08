import { z } from 'zod';
import { ReaderError } from '../src/shared/errors.js';
import {
  chapterCountSchema,
  initialState,
  readingStateSchema,
  type ChapterCount,
} from '../src/shared/contracts.js';

export function decodeState(raw: unknown = initialState()) {
  const state = readingStateSchema.parse(raw);
  return {
    ...state,
    chapterRevisions: state.chapterRevisions ?? {},
    historyEpoch: state.historyEpoch ?? 0,
    storyHistoryEpochs: state.storyHistoryEpochs ?? {},
  };
}
export type StoredState = ReturnType<typeof decodeState>;
function storageError(cause: unknown) {
  return cause instanceof ReaderError
    ? cause
    : new ReaderError(
        'storage',
        '浏览器未能保存阅读记录，请检查站点存储权限或可用空间后重试。',
        undefined,
        { cause },
      );
}
/** Only reading state and small revision/count metadata are durable.
 * No body text, pictures, maps, API payloads or service-worker content cache. */
export class BrowserDatabase {
  private connection: Promise<IDBDatabase> | undefined;
  constructor(readonly name: string) {}
  private open(): Promise<IDBDatabase> {
    return (this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      let abandoned = false;
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('reading'))
          db.createObjectStore('reading');
        if (!db.objectStoreNames.contains('counts'))
          db.createObjectStore('counts');
      };
      request.onerror = () => {
        abandoned = true;
        reject(storageError(request.error));
      };
      request.onblocked = () => {
        abandoned = true;
        reject(
          new ReaderError(
            'storage',
            '阅读记录升级正在等待其他窗口关闭，请关闭旧阅读窗口后重试。',
          ),
        );
      };
      request.onsuccess = () => {
        const db = request.result;
        if (abandoned) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.connection = undefined;
        };
        resolve(db);
      };
    }).catch((error: unknown) => {
      this.connection = undefined;
      throw storageError(error);
    }));
  }
  private async transaction<T>(
    name: 'reading' | 'counts',
    mode: IDBTransactionMode,
    execute: (
      store: IDBObjectStore,
      finish: (value: T) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(name, mode);
      let result: { value: T } | undefined;
      let failure: unknown;
      tx.oncomplete = () =>
        result
          ? resolve(result.value)
          : reject(storageError(new Error('Missing transaction result')));
      tx.onerror = () => reject(storageError(failure ?? tx.error));
      tx.onabort = () => reject(storageError(failure ?? tx.error));
      const fail = (error: unknown) => {
        failure = error;
        tx.abort();
      };
      try {
        execute(
          tx.objectStore(name),
          (value) => {
            result = { value };
          },
          fail,
        );
      } catch (error) {
        fail(error);
      }
    }).catch((cause: unknown) => {
      throw storageError(cause);
    });
  }
  state(update?: (state: StoredState) => StoredState): Promise<StoredState> {
    return this.transaction('reading', 'readwrite', (store, finish, fail) => {
      const request = store.get('state');
      request.onsuccess = () => {
        try {
          const current = decodeState(request.result);
          const next = update ? decodeState(update(current)) : current;
          if (update || request.result === undefined) store.put(next, 'state');
          finish(next);
        } catch (error) {
          fail(error);
        }
      };
    });
  }
  counts(): Promise<Map<string, ChapterCount>> {
    return this.transaction('counts', 'readonly', (store, finish, fail) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          finish(
            new Map(
              z
                .array(chapterCountSchema)
                .parse(request.result)
                .map((value) => [value.chapterId, value]),
            ),
          );
        } catch (error) {
          fail(error);
        }
      };
    });
  }
  count(
    value: Omit<ChapterCount, 'verifiedAt'>,
    expectedRevision: string | undefined,
  ): Promise<ChapterCount> {
    return this.transaction('counts', 'readwrite', (store, finish, fail) => {
      const request = store.get(value.chapterId);
      request.onsuccess = () => {
        try {
          const current =
            request.result === undefined
              ? undefined
              : chapterCountSchema.parse(request.result);
          if (
            current?.revision !== expectedRevision &&
            current?.revision !== value.revision
          )
            throw new ReaderError(
              'conflict',
              '另一窗口已更新本篇字数，请刷新重试；原记录已保留。',
            );
          if (
            current?.revision === value.revision &&
            current.wordCount === value.wordCount &&
            current.contentKind === value.contentKind
          ) {
            finish(current);
            return;
          }
          const verified = {
            ...value,
            verifiedAt: Math.max(Date.now(), (current?.verifiedAt ?? 0) + 1),
          };
          store.put(verified, value.chapterId);
          finish(verified);
        } catch (error) {
          fail(error);
        }
      };
    });
  }
}
