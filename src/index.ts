import { none, Plugin, PluginCallbacks, State } from '@hookstate/core';
import { getPath, isEmpty } from './utils';

const PluginID = Symbol('BrowserStoragePersistence');
const SERIALIZABLE_NONE = '__NONE__';
const STATE_UPDATE_KEY = '__state_update';
const STATE_UPDATE_FROM_KEY = '__state_from';

export interface BrowserStoragePersistenceOptions {
  id: string,
  storage: typeof browser.storage,
  areaName: 'local' | 'sync',
  initialState: any,
}

export function BrowserStoragePersistence({
                                            id,
                                            storage,
                                            initialState,
                                            areaName
                                          }: BrowserStoragePersistenceOptions): () => Plugin {
  const storageArea = storage[areaName];
  const keys = Object.keys(initialState);

  return () => ({
    id: PluginID,
    init: (state: State<any>) => {
      // retrieve previously persisted state (asynchronous)
      // TODO handle migrations
      state.set(storageArea.get(keys));

      let batchingContext: unknown;

      // reapply changes to storage onto the state
      function changeListener(changes: Record<string, browser.storage.StorageChange>) {
        // Only handle changes that include `__state_update` key
        if (changes[STATE_UPDATE_KEY]) {
          // use a reviver to
          const stateUpdate = JSON.parse(changes[STATE_UPDATE_KEY].newValue, function (k: any, v: any) {
            return v === SERIALIZABLE_NONE ? none : v;
          });
          // state saved from current process
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
          // If there is a context with the `STATE_UPDATE_FROM_KEY` key, it means that the update comes from
          // the onChanged listener, so we do not want to persist it again.
          if (batchingContext && (batchingContext as any)[STATE_UPDATE_FROM_KEY]) {
            return;
          }
          if (!('state' in p)) {
            // state is completely removed, that's probably an error, as we would want the default state instead here
            console.error('State completely removed. This is not handled by BrowserStoragePersistence plugin');
          } else if (p.path.length > 0) {
            const value = 'value' in p ? p.value : SERIALIZABLE_NONE;
            storageArea.set({
              [p.path[0]]: p.state[p.path[0]],
              [STATE_UPDATE_KEY]: JSON.stringify({
                from: id,
                path: p.path,
                value: value,
                // `none` is a Symbol, and thus not serializable
                merged: p.merged,
              }, function (k, v) {
                return v === none ? SERIALIZABLE_NONE : v;
              }),
            });
          } else {
            storageArea.set({
              ...p.value,
              [STATE_UPDATE_KEY]: JSON.stringify({
                from: id,
                path: [],
              }, function (k, v) {
                return v === none ? SERIALIZABLE_NONE : v;
              }),
            });
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
        },
      } as PluginCallbacks;
    },
  });
}
