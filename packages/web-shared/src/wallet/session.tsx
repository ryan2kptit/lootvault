"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type Config, useConfig, useConnection } from "wagmi";
import { getConnection } from "wagmi/actions";
import { useStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import { type Api, createApi, type Session } from "../api";
import { publicEnv } from "../env";
import { isLive, tokenFor } from "./session-token";

export type AppName = "studio" | "storefront";

interface SessionState {
  session: Session | null;
  setSession: (session: Session) => void;
  clearSession: () => void;
}

/** The SIWE session (JWT) of one app, persisted in localStorage under `lv:{app}:jwt`. */
function createSessionStore(app: AppName) {
  return createStore<SessionState>()(
    persist(
      (set) => ({
        session: null,
        setSession: (session) => set({ session }),
        clearSession: () => set({ session: null }),
      }),
      {
        name: `lv:${app}:jwt`,
        storage: createJSONStorage(() => localStorage),
        partialize: ({ session }) => ({ session }),
        skipHydration: true,
      },
    ),
  );
}

type SessionStore = ReturnType<typeof createSessionStore>;

/**
 * Browser API client: same-origin `/api/*` (rewritten by Next to the services), with the session's bearer token.
 * The token is read at request time and sent only while the wallet it was issued to is the connected one, so a
 * request fired during an account switch (before the session is dropped) or after a reload without a wallet is anonymous.
 */
function createBrowserApi(store: SessionStore, wagmiConfig: Config): Api {
  return createApi({
    baseUrl: (service) => `${publicEnv.apiUrl}/${service}`,
    getToken: () => tokenFor(store.getState().session, getConnection(wagmiConfig).address) ?? null,
    onUnauthorized: () => store.getState().clearSession(),
  });
}

const SessionContext = createContext<{ store: SessionStore; api: Api } | null>(null);

export function SessionProvider({ app, children }: { app: AppName; children: ReactNode }) {
  const wagmiConfig = useConfig();
  const queryClient = useQueryClient();
  const [value] = useState(() => {
    const store = createSessionStore(app);
    return { store, api: createBrowserApi(store, wagmiConfig) };
  });
  const { address, status } = useConnection();

  useEffect(() => {
    void value.store.persist.rehydrate();
  }, [value.store]);

  // A session and the data fetched with it belong to one wallet: drop both when the wallet disconnects or switches account.
  const previousAddress = useRef(address);
  useEffect(() => {
    if (previousAddress.current !== undefined && previousAddress.current !== address) {
      value.store.getState().clearSession();
      queryClient.removeQueries();
    }
    previousAddress.current = address;
  }, [address, queryClient, value.store]);

  const session = useStore(value.store, (state) => state.session);
  useEffect(() => {
    if (status === "connected" && session && session.address !== address.toLowerCase()) value.store.getState().clearSession();
  }, [status, address, session, value.store]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside <SessionProvider>");
  return context;
}

/** The API client for client components. Sends the bearer token when signed in. */
export function useApi(): Api {
  return useSessionContext().api;
}

const subscribeNever = () => () => {};

/**
 * False while React hydrates server HTML, true afterwards. The wallet only exists in the browser, and wagmi may
 * reconnect before a streamed Suspense boundary hydrates, so wallet state is hidden until hydration is over.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/** Who is using the app: no wallet, a wallet without a session, or a signed-in wallet. */
export function useSession() {
  const { store } = useSessionContext();
  const session = useStore(store, (state) => state.session);
  const connection = useConnection();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const clearSession = useStore(store, (state) => state.clearSession);
  const signOut = useCallback(() => {
    clearSession();
    queryClient.removeQueries();
  }, [clearSession, queryClient]);
  const address = hydrated ? connection.address : undefined;
  const status = hydrated ? connection.status : "disconnected";
  const signedIn = status === "connected" && address !== undefined && isLive(session) && session.address === address.toLowerCase();
  return {
    address,
    /** "connecting"/"reconnecting" while wagmi restores the wallet after a reload. */
    walletStatus: status,
    session: signedIn ? session : null,
    setSession: useStore(store, (state) => state.setSession),
    signOut,
  };
}
