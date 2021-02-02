# hookstate-plugin-web-extension

## Install
```bash
npm i hookstate-plugin-web-extension
# or
yarn add hookstate-plugin-web-extension
```

## Features
- Compatible with _chrome.storage.*_ and _browser.storage.*_
- State synced between background page and all content scripts through _browser/chrome.storage_
- Configurable persistence. Choose which keys of the storage you want to load at init
- Initial synchronous state. It will be erased upon init if persisted data is found in storage
- Use an internal `__state_update` key upon each storage update to pass metadata between processes.
  This allows processes receiving the changes to apply only necessary updates on part of their tree to avoid unnecessary rerendering.
  See [details below](#forward-partial-updates-of-the-tree-through-browser-storage)
- TODO: Migrations between state versions

## Usage

### Background page
```ts
import { BrowserExtensionStorage } from 'hookstate-plugin-web-extension';

import { GlobalState } from './mystate/global/types';
import { initialState } from './mystate/global/initial';

const state = createState<GlobalState>(initialState);

state.attach(
  BrowserExtensionStorage({
    // either browser.storage or chrome.storage
    storage: browser.storage,
    // either 'local' or 'sync'
    areaName: 'local',
    // id of the plugin instance, must be different for each process
    id: 'background',
    // your initial state. All keys represented in your GlobalState type MUST be present in this one
    initialState: initialState,
    // true for background page, false for all others
    leader: true,
    // which persisted keys of GlobalState do you want to reload upon start?
    persistedKeys: [],
    // what is the version of your state. This needs to be updated if you need to run a migration script (TODO)
    version: 1,
    // called whenever the plugin encounters an Error
    onError: notify,
  }),
);
```

### Other processes (content scripts, popups)
```ts
import { BrowserExtensionStorage } from 'hookstate-plugin-web-extension';

// same type and initial state as for the background page
import { GlobalState } from './mystate/global/types';
import { initialState } from './mystate/global/initial';

const state = createState<GlobalState>(initialState);

state.attach(
  BrowserExtensionStorage({
    storage: browser.storage,
    areaName: 'local',
    // MUST be different for each process
    id: 'someRandomId',
    initialState: initialState,
    leader: false,
    onError: notify,
  }),
);
```

## Forward partial updates of the tree through browser storage
The [Storage API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/set) only
allows us to update root values. Here is an example:
```ts
browser.storage.local.set({
  a: 'a1',
  b: {
    c: 1,
    d: 2,
  }
})
```

If I want to update `b.c`, with this API, I must set the whole `b` tree:
```ts
browser.storage.local.set({
  b: {
    c: 2,
    d: 2,
  }
})

browser.storage.onChanged.addListener(changes => {
  // here we will have the whole `changes.b` tree, so the simple solution would be:
  hookstateState.b.set(changes.b.newValue)
});
```

And this is not good, because it means that we get a new `b.d` object, and it will be considerer as updated by hookstate.
In this case it is not particularly a problem, by imagine a list with hundreds of items updated whenever you update one,
you'd loose all the optimisations of hookstate.

In this extension we are smarter than this. As a matter of fact we can abuse the storage API to use a custom key (`__state_update`)
upon each update of the state, which value contains necessary metadata to only apply necessary changes onto the target states.

Upon changes, this `__state_update` is computed and sent along the real state update through the `storage.set` method.
When other processes receive those changes, they know that:
- If this key is present, it means the update comes from this plugin
- We can use this computed metadata to apply more precise `state.merge` or `state.set` on the state, so that it reflects
  what has been done in the originating process.

## License
[MIT](http://mit-license.org)
