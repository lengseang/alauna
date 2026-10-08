import { useEffect, useSyncExternalStore } from 'react';
import { BackHandler } from 'react-native';
import { createStore } from '../core/store.ts';

/**
 * Chat is home and always mounted. Everything else is pushed on top of it and closed with the back arrow
 * (or Android Back). There is no tab bar; the drawer is the only menu.
 */
export type Route = 'chat' | 'models' | 'persona' | 'persona/memory' | 'settings' | 'settings/storage' | 'settings/advanced' | 'settings/about';

const navStore = createStore<{ stack: Route[] }>({ stack: ['chat'] });

export function push(route: Route): void {
  const { stack } = navStore.getState();
  if (stack[stack.length - 1] === route) return;
  navStore.setState({ stack: [...stack, route] });
}

/** Go back one screen. Returns false when already at the root (let Android minimise the app). */
export function pop(): boolean {
  const { stack } = navStore.getState();
  if (stack.length <= 1) return false;
  navStore.setState({ stack: stack.slice(0, -1) });
  return true;
}

let lastBackAt = 0;

/** On-screen Back button: a quick double-tap must not skip two screens (hardware Back keeps using pop()). */
export function goBack(): boolean {
  // No parameters on purpose: Pressable passes its press event as the first argument.
  const now = Date.now();
  if (now - lastBackAt < 350) return true;
  lastBackAt = now;
  return pop();
}

export function resetTo(route: Route): void {
  navStore.setState({ stack: [route] });
}

export function useStack(): Route[] {
  return useSyncExternalStore(navStore.subscribe, () => navStore.getState().stack);
}

export function useRoute(): Route {
  const stack = useStack();
  return stack[stack.length - 1];
}

/** Android Back: handlers registered later run first (the open drawer / sheets register while open). */
export function useBackHandler(enabled: boolean, handler: () => boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [enabled, handler]);
}
