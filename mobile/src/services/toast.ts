import { useSyncExternalStore } from 'react';
import { createStore } from '../core/store.ts';

const toastStore = createStore<{ text: string | null; id: number }>({ text: null, id: 0 });
let timer: ReturnType<typeof setTimeout> | null = null;

/** Short, non-blocking message at the top of the screen. */
export function showToast(text: string, ms = 3200): void {
  toastStore.setState((s) => ({ text, id: s.id + 1 }));
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => toastStore.setState({ text: null }), ms);
}

export function useToast(): { text: string | null; id: number } {
  return useSyncExternalStore(toastStore.subscribe, toastStore.getState);
}
