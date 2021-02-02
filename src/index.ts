import { none, Plugin, PluginCallbacks, State } from '@hookstate/core';
import { getPath, isEmpty } from './utils';

const PluginID = Symbol('BrowserExtensionStorage');
const SERIALIZABLE_NONE = '__NONE__';
const STATE_UPDATE_KEY = '__state_update';
const STATE_UPDATE_FROM_KEY = '__state_from';
const STATE_VERSION_KEY = '__state_version';

type FnCallback<T, R> = (param: T, callback: (result: R) => void) => void;
type FnPromise<T, R> = (param: T) => Promise<R>;

function wrapPromise<T, R>(fn: FnCallback<T, R> | FnPromise<T, R>): (param: T) => Promise<R> {
  return param => new Promise((resolve, reject) => {
    const ret = fn(param, result => {
      if (globalThis.chrome?.runtime?.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });

    if (ret && ret.then) {
      ret.then(resolve).catch(reject);
    }
  });
}

interface BrowserExtensionLeaderStorageOptions<T extends Record<string, any>> {
  leader: true,
  version: number,
  persistedKeys: (keyof T)[],
}

interface BrowserExtensionNonLeaderStorageOptions {
  leader: false,
}

export type BrowserExtensionStorageOptions<T extends Record<string, any>> = {
  id: string,
  storage: typeof browser.storage | typeof chrome.storage,
  areaName: 'local' | 'sync',
  initialState: T,
  onError?: (err: any) => void
} & (BrowserExtensionLeaderStorageOptions<T> | BrowserExtensionNonLeaderStorageOptions);

export function BrowserExtensionStorage<T>(options: BrowserExtensionStorageOptions<T>): () => Plugin {
  const {
    id,
    storage,
    initialState,
    areaName,
    onError
  } = options;
  const storageArea = storage[areaName];
  const keys = Object.keys(initialState);
  const keysToLoad = options.leader ? options.persistedKeys as string[] : keys;
  const keysToClear = options.leader ? keys.filter(key => !keysToLoad.includes(key)) : [];
  const onErrorCb = onError ? onError : console.error;

  return () => ({
    id: PluginID,
    init: (state: State<any>) => {
      // retrieve previously persisted state (asynchronous), and cleanup keys non marked as persisted
      wrapPromise(storageArea.get as typeof chrome.storage.local.get)(keysToLoad.concat(STATE_VERSION_KEY)).then(values => {
        if (STATE_VERSION_KEY in values) {
          const { [STATE_VERSION_KEY]: _, ...valuesWithoutVersion } = values;

          // TODO handle migrations
          // set previous persisted data in state
          state.merge(valuesWithoutVersion);
          // the leader is responsible for cleaning non persistent data
          if (keysToClear.length > 0) {
            return storageArea.remove(keysToClear);
          }
          return;
        }
        if (options.leader) {
          // if no previous state was persisted, persist initialState
          return storageArea.set({ ...initialState, [STATE_VERSION_KEY]: options.version });
        }
      }).catch(onErrorCb);

      let batchingContext: unknown;

      // reapply changes to storage onto the state
      function changeListener(changes: Record<string, browser.storage.StorageChange>) {
        // only handle changes that include STATE_UPDATE_KEY
        if (changes[STATE_UPDATE_KEY]) {
          // use a reviver to unserialize `none`
          const stateUpdate = JSON.parse(changes[STATE_UPDATE_KEY].newValue, function (k: any, v: any) {
            return v === SERIALIZABLE_NONE ? none : v;
          });
          // if the state was saved from current instance, do not take the change into account to avoid infinite loop
          if (stateUpdate.from === id) return;

          if (!isEmpty(stateUpdate.merged)) {
            state.batch(
              s => {
                getPath(s, stateUpdate.path).merge(stateUpdate.merged);
              },
              { [STATE_UPDATE_FROM_KEY]: stateUpdate.from },
            );
          } else if (stateUpdate.path.length === 0) {
            state.batch(
              s => {
                for (const [key, val] of Object.entries(changes)) {
                  if (!keys.includes(key)) continue;
                  s[key].set(val.newValue);
                }
              },
              { [STATE_UPDATE_FROM_KEY]: stateUpdate.from },
            );
          } else if (stateUpdate.path.length > 0) {
            state.batch(
              s => {
                getPath(s, stateUpdate.path).set(stateUpdate.value);
              },
              { [STATE_UPDATE_FROM_KEY]: stateUpdate.from },
            );
          } else {
            console.error('Malformed changes', changes);
          }
        }
      }

      storage.onChanged.addListener(changeListener);

      return {
        onSet: p => {
          // If there is a context with STATE_UPDATE_FROM_KEY, it means that the update comes from
          // the onChanged listener, so we do not want to persist it again.
          if (batchingContext && STATE_UPDATE_FROM_KEY in (batchingContext as any)) {
            return;
          }
          if (!('state' in p)) {
            // state is completely removed, that's probably an error, as we would want the default state instead here
            onErrorCb(new Error('State completely removed. This is not handled by BrowserStoragePersistence plugin'));
          } else if (p.path.length > 0) {
            const value = 'value' in p ? p.value : SERIALIZABLE_NONE;
            wrapPromise(storageArea.set)({
              [p.path[0]]: p.state[p.path[0]],
              [STATE_UPDATE_KEY]: JSON.stringify({
                from: id,
                path: p.path,
                value: value,
                merged: p.merged,
                // `none` is a Symbol, and thus not serializable
              }, function (k, v) {
                return v === none ? SERIALIZABLE_NONE : v;
              }),
            }).catch(onErrorCb);
          } else {
            wrapPromise(storageArea.set)({
              ...p.value,
              [STATE_UPDATE_KEY]: JSON.stringify({
                from: id,
                path: [],
              }, function (k, v) {
                return v === none ? SERIALIZABLE_NONE : v;
              }),
            }).catch(onErrorCb);
          }
        },
        onDestroy: () => {
          storage.onChanged.removeListener(changeListener);
        },
        onBatchStart: p => {
          batchingContext = p.context;
        },
        onBatchFinish: () => {
          batchingContext = {};
          // TODO actual batching
        },
      } as PluginCallbacks;
    },
  });
}
