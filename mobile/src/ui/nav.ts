import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { BackHandler } from 'react-native';
import { createStore } from '../core/store.ts';
import { stackPop, stackPush, type StackEntry } from './logic';
import type { RouteName } from './routes';

/**
 * Chat is home and always mounted at the bottom of the stack. Every other screen is pushed on top (deep stacks are
 * fine: Settings > Advanced > Backend...) and closed with the back arrow, an edge swipe, or Android Back.
 * Screens are registered in routes.tsx (one line each); a Route is any registered name, or 'chat'.
 */
export type Route = 'chat' | RouteName;
export type RouteParams = Record<string, unknown>;
export type Entry = StackEntry<Route>;

let seq = 0;
const entry = (route: Route, params?: RouteParams): Entry => ({ key: `${route}#${++seq}`, route, params });
const navStore = createStore<{ stack: readonly Entry[] }>({ stack: [entry('chat')] });
const setStack = (stack: readonly Entry[]) => navStore.setState({ stack });

/** Open a screen on top. Pushing the screen that is already on top (same params) does nothing. */
export function push(route: Route, params?: RouteParams): void {
  const { stack } = navStore.getState();
  const next = stackPush(stack, entry(route, params));
  if (next !== stack) setStack(next);
}

/** Swap the top screen (e.g. a finished setup step) without growing the stack. */
export function replace(route: Route, params?: RouteParams): void {
  const { stack } = navStore.getState();
  setStack(stack.length <= 1 ? [...stack, entry(route, params)] : [...stack.slice(0, -1), entry(route, params)]);
}

/** Go back one screen. Returns false when already at the root (let Android minimise the app). */
export function pop(): boolean {
  const next = stackPop(navStore.getState().stack);
  if (!next) return false;
  setStack(next);
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

/** Clear the stack down to one screen ('chat' = home). */
export function resetTo(route: Route, params?: RouteParams): void {
  const root = navStore.getState().stack[0];
  setStack(route === 'chat' ? [root] : [root, entry(route, params)]);
}

/** The full stack (the Stack renderer uses it). */
export function useEntries(): readonly Entry[] {
  return useSyncExternalStore(navStore.subscribe, () => navStore.getState().stack);
}

/** v1 shape: route names bottom -> top. */
export function useStack(): Route[] {
  return useEntries().map((e) => e.route);
}

export function useRoute(): Route {
  const stack = useEntries();
  return stack[stack.length - 1].route;
}

/** The entry a screen was pushed with (provided by the Stack around each layer). */
export const EntryContext = createContext<Entry | null>(null);

/** Params passed to push(route, params) for THIS screen. Typed by the caller: useParams<{ modelId: string }>(). */
export function useParams<T extends RouteParams = RouteParams>(): Partial<T> {
  return (useContext(EntryContext)?.params ?? {}) as Partial<T>;
}

/** Android Back: handlers registered later run first (the open drawer / sheets register while open). */
export function useBackHandler(enabled: boolean, handler: () => boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [enabled, handler]);
}
