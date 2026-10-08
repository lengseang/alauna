/**
 * The ONE network gate. Every network request in the app asks it first (W1's hfClient/downloads use it too).
 *
 * Offline-strict (Settings > Security, default ON): only downloads the user started may touch the network. Anything
 * else (catalog refresh, background checks...) is refused and counted, so the UI can say "blocked N requests".
 * Chat, voice and models never need the network.
 */
import { useSyncExternalStore } from 'react';
import { createStore } from '../core/store.ts';
import { settingsStore } from './settings.ts';

/** 'user-download' = a model/companion download the user started (or its automatic resume / Hub size+hash lookup). */
export type NetworkPurpose = 'user-download' | 'metadata' | 'other';

export interface NetworkGateState {
  offlineStrict: boolean;
  blockedCount: number;
  lastBlocked: { purpose: NetworkPurpose; url?: string; at: number } | null;
}

export const networkGateStore = createStore<NetworkGateState>({ offlineStrict: true, blockedCount: 0, lastBlocked: null });

export class NetworkBlockedError extends Error {
  readonly purpose: NetworkPurpose;
  constructor(purpose: NetworkPurpose) {
    super('Offline-strict mode is on: CHIWIWI only connects to the internet for downloads you start. Turn it off in Settings > Security to allow this.');
    this.name = 'NetworkBlockedError';
    this.purpose = purpose;
  }
}

/** Pure rule (tested). */
export function isNetworkAllowed(offlineStrict: boolean, purpose: NetworkPurpose): boolean {
  return !offlineStrict || purpose === 'user-download';
}

export const networkGate = {
  allowed(purpose: NetworkPurpose): boolean {
    return isNetworkAllowed(settingsStore.getState().offlineStrict, purpose);
  },
  /** Throws NetworkBlockedError (and counts it) when the request is not allowed. */
  check(purpose: NetworkPurpose, url?: string): void {
    const strict = settingsStore.getState().offlineStrict;
    if (isNetworkAllowed(strict, purpose)) return;
    networkGateStore.setState((s) => ({ offlineStrict: strict, blockedCount: s.blockedCount + 1, lastBlocked: { purpose, url, at: Date.now() } }));
    throw new NetworkBlockedError(purpose);
  },
  /** `fetch` behind the gate. */
  fetch(url: string, init: RequestInit | undefined, purpose: NetworkPurpose): Promise<Response> {
    try {
      networkGate.check(purpose, url);
    } catch (e) {
      return Promise.reject(e);
    }
    return fetch(url, init);
  },
};

settingsStore.subscribe(() => {
  const strict = settingsStore.getState().offlineStrict;
  if (networkGateStore.getState().offlineStrict !== strict) networkGateStore.setState({ offlineStrict: strict });
});

export function useNetworkGate(): NetworkGateState {
  return useSyncExternalStore(networkGateStore.subscribe, networkGateStore.getState);
}
