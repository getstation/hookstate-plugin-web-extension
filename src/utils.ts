import { State } from '@hookstate/core';

export function getPath<T>(obj: State<T>, path: any[]): State<any> {
  return path.reduce((acc, cur) => acc[cur], obj);
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isEmpty(obj: any): boolean {
  return obj === undefined || obj === null || (Object.keys(obj).length === 0 && obj.constructor === Object);
}