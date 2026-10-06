import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useSyncExternalStore } from 'react';
import { createStore } from '../core/store.ts';

export type Route =
  | 'chat'
  | 'models'
  | 'settings'
  | 'settings/soul'
  | 'settings/storage'
  | 'settings/memory'
  | 'settings/advanced'
  | 'settings/about';

const navStore = createStore<{ stack: Route[] }>({ stack: ['chat'] });

export function push(route: Route): void {
  const { stack } = navStore.getState();
  if (stack[stack.length - 1] === route) return;
  navStore.setState({ stack: [...stack, route] });
}

/** Go back one screen. Returns false when already at the root (let Android exit/minimise). */
export function pop(): boolean {
  const { stack } = navStore.getState();
  if (stack.length <= 1) return false;
  navStore.setState({ stack: stack.slice(0, -1) });
  return true;
}

export function resetTo(route: Route): void {
  navStore.setState({ stack: [route] });
}

export function useRoute(): Route {
  return useSyncExternalStore(navStore.subscribe, () => {
    const s = navStore.getState().stack;
    return s[s.length - 1];
  });
}

/** Android Back: handlers registered later run first (sheets/drawers register while open). */
export function useBackHandler(enabled: boolean, handler: () => boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [enabled, handler]);
}
