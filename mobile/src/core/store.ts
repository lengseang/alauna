/**
 * Minimal observable store (works with React's useSyncExternalStore).
 * Snapshots are immutable: setState always creates a new object, so React
 * re-renders exactly when something changed.
 */
export interface Store<S> {
  getState(): S;
  setState(patch: Partial<S> | ((s: S) => Partial<S>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
