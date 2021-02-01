import { createState, none, State } from '@hookstate/core';
import browser from 'sinon-chrome';
import { BrowserExtensionStorage, BrowserExtensionStorageOptions } from '../src';

describe('hookstate-plugin-web-extension', () => {
  const defaultState = { a: [] as any[], b: { c: 2 }, d: 8 };
  let state: State<typeof defaultState>;
  const onError = jest.fn();

  function getDefaultState(): typeof defaultState {
    return JSON.parse(JSON.stringify(defaultState))
  }

  beforeAll(function () {
    state = createState(getDefaultState());

    state.attach(BrowserExtensionStorage({
      id: 'test-1',
      areaName: 'local',
      initialState: defaultState,
      storage: browser.storage,
      persistedKeys: ['b', 'd'],
      leader: true,
      onError: onError,
      version: 1
    }));
  });

  beforeEach(() => {
    state.set(getDefaultState());
    browser.storage.local.set.resetHistory();
    browser.storage.local.remove.resetHistory();
    onError.mockClear();
  });

  describe('init', () => {
    let internalState: State<typeof defaultState>;

    function prepare(options: Partial<BrowserExtensionStorageOptions<typeof defaultState>> = {}) {
      internalState.attach(BrowserExtensionStorage({
        id: 'test-1',
        areaName: 'local',
        initialState: defaultState,
        storage: browser.storage,
        persistedKeys: ['b', 'd'],
        leader: true,
        onError: onError,
        version: 1,
        ...options
      }));
    }

    beforeEach(() => {
      internalState = createState(getDefaultState());

      browser.storage.local.get.withArgs(['b', 'd', '__state_version']).yields({
        a: [] as any[],
        b: { c: 3 },
        d: 9,
        __state_version: 1
      });
    });

    afterEach(() => {
      browser.storage.local.get.flush();
    });

    it('should restore previous data tagged as persistent (leader)', async function () {
      prepare();
      // wait for async state update
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(internalState.get()).toEqual({ a: [], b: { c: 3 }, d: 9 });
    });

    it('should restore previous data tagged as persistent (not leader)', async function () {
      prepare({
        leader: false,
      });
      // wait for async state update
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(internalState.get()).toEqual({ a: [], b: { c: 3 }, d: 9 });
    });

    it('should clear previous data if flagged as leader', async function () {
      prepare();
      // wait for async state update
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(browser.storage.local.remove).toHaveBeenAlwaysCalledWith(['a']);
    });

    it('should not clear previous data if not flagged as leader', async function () {
      prepare({
        leader: false,
      });
      // wait for async state update
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(browser.storage.local.remove).not.toHaveBeenCalled();
    });
  });

  describe('write', () => {

    describe('deep', () => {
      it('merge', () => {
        state.b.merge({ c: 4 });
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          b: { c: 4 },
          __state_update: '{"from":"test-1","path":["b"],"value":{"c":4},"merged":{"c":4}}'
        });
      });

      it('deep-merge', () => {
        state.b.c.merge(5);
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          b: { c: 5 },
          __state_update: '{"from":"test-1","path":["b","c"],"value":5}'
        });
      });

      it('set', () => {
        state.b.set({ c: 4 });
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          b: { c: 4 },
          __state_update: '{"from":"test-1","path":["b"],"value":{"c":4}}'
        });
      });

      it('deep-set', () => {
        state.b.c.set(5);
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          b: { c: 5 },
          __state_update: '{"from":"test-1","path":["b","c"],"value":5}'
        });
      });

      it('set none', () => {
        state.b.set({ c: none });
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          b: { c: none },
          __state_update: '{"from":"test-1","path":["b"],"value":{"c":"__NONE__"}}'
        });
      });

      it('deep-set none', () => {
        state.b.c.set(none);
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          b: {},
          __state_update: '{"from":"test-1","path":["b","c"],"value":"__NONE__"}'
        });
      });

      it('merge none', () => {
        state.b.merge({ c: none });
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          b: {},
          __state_update: '{"from":"test-1","path":["b"],"value":{},"merged":{"c":"__NONE__"}}'
        });
      });

      it('deep-merge none', () => {
        state.b.c.merge(none);
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          b: {},
          __state_update: '{"from":"test-1","path":["b","c"],"value":"__NONE__"}'
        });
      });
    });

    describe('root', () => {
      it('merge', () => {
        state.merge({ d: 9 });
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          a: [],
          b: { c: 2 },
          d: 9,
          __state_update: '{"from":"test-1","path":[]}'
        });
      });


      it('set', () => {
        state.set({ a: ['a1'] as any[], b: { c: 3 }, d: 2 });
        expect(browser.storage.local.set).toHaveBeenCalledOnceWith({
          a: ['a1'],
          b: { c: 3 },
          d: 2,
          __state_update: '{"from":"test-1","path":[]}'
        });
      });
    });
  });

  describe('listen', () => {
    it('should not update state if it comes from same source', () => {
      browser.storage.onChanged.dispatch({
        '__state_update': {
          'newValue': '{"from":"test-1","path":["a"],"value":[{"y":1}]}',
        }, 'a': { 'newValue': [{ 'y': 1 }] }
      });
      expect(browser.storage.local.set).not.toHaveBeenCalled();
      expect(state.a.get()).toHaveLength(0);
    });

    describe('set path', () => {
      it('should update state if it comes for a different source', () => {
        browser.storage.onChanged.dispatch({
          '__state_update': {
            'newValue': '{"from":"test-2","path":["a"],"value":[{"y":1}]}',
          }, 'a': { 'newValue': [{ 'y': 1 }] }
        });
        expect(browser.storage.local.set).not.toHaveBeenCalled();
        expect(state.a.get()).toHaveLength(1);
        expect((state.a[0] as any).y.get()).toEqual(1);
      });
    });

    describe('merge path', () => {
      it('should update state if it comes for a different source', () => {
        browser.storage.onChanged.dispatch({
          '__state_update': {
            'newValue': '{"from":"test-2","path":["b"],"value":{"c":4},"merged":{"c":4}}',
          }, 'b': { 'newValue': { 'c': 4 } }
        });
        expect(browser.storage.local.set).not.toHaveBeenCalled();
        expect(state.b.c.get()).toEqual(4);
      });
    });

    describe('set path to none', () => {
      it('should update state if it comes for a different source', () => {
        state.a.set([{ y: 1 }, { y: 2 }]);
        browser.storage.local.set.resetHistory();
        browser.storage.onChanged.dispatch({
          '__state_update': {
            'newValue': '{"from":"test-2","path":["a",0],"value":"__NONE__"}',
          }, 'a': { 'newValue': [{ 'y': 2 }] }
        });
        expect(browser.storage.local.set).not.toHaveBeenCalled();
        expect(state.a.get()).toHaveLength(1);
        expect((state.a[0] as any).y.get()).toEqual(2);
      });
    });

    describe('set merge to none', () => {
      it('should update state if it comes for a different source', () => {
        state.a.set([{ y: 1 }, { y: 2 }]);
        browser.storage.local.set.resetHistory();
        browser.storage.onChanged.dispatch({
          '__state_update': {
            'newValue': '{"from":"test-2","path":["a"],"value":[{"y":2}],"merged":{"0":"__NONE__"}}',
          }, 'a': { 'newValue': [{ 'y': 2 }] }
        });
        expect(browser.storage.local.set).not.toHaveBeenCalled();
        expect(state.a.get()).toHaveLength(1);
        expect((state.a[0] as any).y.get()).toEqual(2);
      });
    });

    describe('merge root', () => {
      it('should not update state if it comes for a different source', () => {
        browser.storage.onChanged.dispatch({
          a: { 'newValue': ['a1'] },
          b: { 'newValue': { c: 4 } },
          d: { 'newValue': 8 },
          '__state_update': {
            'newValue': '{"from":"test-1","path":[]}',
          }
        });
        expect(browser.storage.local.set).not.toHaveBeenCalled();
        expect(state.a.get()).toHaveLength(0);
      });

      it('should update state if it comes for a different source', () => {
        browser.storage.onChanged.dispatch({
          a: { 'newValue': ['a1'] },
          b: { 'newValue': { c: 4 } },
          d: { 'newValue': 8 },
          '__state_update': {
            'newValue': '{"from":"test-2","path":[]}',
          }
        });
        expect(browser.storage.local.set).not.toHaveBeenCalled();
        expect(state.a.get()).toHaveLength(1);
        expect((state.a[0] as any).get()).toEqual('a1');
        expect(state.b.c.get()).toEqual(4);
        expect(state.d.get()).toEqual(8);
      });
    });
  });
});