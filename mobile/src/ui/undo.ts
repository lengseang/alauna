import { useSyncExternalStore } from 'react';
import { createStore } from '../core/store.ts';

export interface UndoItem {
  id: number;
  text: string;
  onUndo: () => void | Promise<unknown>;
}

const store = createStore<{ item: UndoItem | null }>({ item: null });
let timer: ReturnType<typeof setTimeout> | null = null;
let counter = 0;

/** A toast with an Undo button (5s). Use it instead of a confirm dialog for deletions that can be reversed. */
export function showUndo(text: string, onUndo: () => void | Promise<unknown>, ms = 5000): void {
  store.setState({ item: { id: ++counter, text, onUndo } });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => store.setState({ item: null }), ms);
}

export function dismissUndo(): void {
  if (timer) clearTimeout(timer);
  store.setState({ item: null });
}

export function useUndo(): UndoItem | null {
  return useSyncExternalStore(store.subscribe, () => store.getState().item);
}
