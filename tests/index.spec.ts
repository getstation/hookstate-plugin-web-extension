import { createState, none, State } from '@hookstate/core';
import browser from 'sinon-chrome';
import { BrowserStoragePersistence } from '../src';

describe('hookstate-plugin-web-extension', () => {
  const defaultState = { a: [] as any[], b: { c: 2 }, d: 8 };
  let state: State<typeof defaultState>;

  function getDefaultState(): typeof defaultState {
    return JSON.parse(JSON.stringify(defaultState))
  }

  beforeAll(function () {
    state = createState(getDefaultState());

    state.attach(BrowserStoragePersistence({
      id: 'test-1',
      areaName: 'local',
      initialState: defaultState,
      storage: browser.storage
    }));
  });

  beforeEach(() => {
    state.set(getDefaultState());
    browser.storage.local.set.resetHistory();
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
        state.a.set([{y: 1}, {y: 2}]);
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
        state.a.set([{y: 1}, {y: 2}]);
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