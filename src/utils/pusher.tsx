/**
 * Section 1: "The Store"
 *
 * This defines a Pusher client and channel connection as a vanilla Zustand store.
 */
import Pusher, { Channel, PresenceChannel } from "pusher-js";
import reactZustandCreate from "zustand";
import vanillaCreate, { StoreApi } from "zustand/vanilla";

const pusher_key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY!;
Pusher.logToConsole = true;

interface PusherZustandStore {
  pusherClient: Pusher;
  channel: Channel;
  presenceChannel: PresenceChannel;

  members: { [key: string]: any };
}
let store: StoreApi<PusherZustandStore>;
const createPusherStore = (slug: string, publishPresence?: boolean) => {
  if (store) {
    console.log("fuck you react I win");
    return store;
  }
  const tempId = "temp-id" + Math.random().toFixed(7);
  const pusherClient = new Pusher(pusher_key, {
    enabledTransports: ["ws", "wss"],
    authEndpoint: "/api/pusher/auth-channel",
    auth: {
      headers: { user_id: tempId },
    },

    cluster: "us3",
  });
  const channel = pusherClient.subscribe(slug);

  const presenceChannel = pusherClient.subscribe(
    `presence-${slug}`
  ) as PresenceChannel;

  (window as any).presenceChannel = presenceChannel;

  const newStore = vanillaCreate<PusherZustandStore>((set) => {
    return {
      pusherClient: pusherClient,
      channel: presenceChannel,
      presenceChannel,

      members: {},
    };
  });

  const updateMembers = () => {
    newStore.setState(() => ({
      members: presenceChannel.members.members,
    }));

    console.log("members???", presenceChannel.members.members);
  };

  presenceChannel.bind("pusher:subscription_succeeded", updateMembers);
  presenceChannel.bind("pusher:member_added", updateMembers);
  presenceChannel.bind("pusher:member_removed", updateMembers);

  store = newStore;

  return newStore;
};

/**
 * Section 2: "The Context Provider"
 *
 * This creates a "Zustand React Context" that we can provide in the component tree.
 */
import createContext from "zustand/context";
const { Provider: PusherZustandStoreProvider, useStore: usePusherStore } =
  createContext<StoreApi<PusherZustandStore>>();

import React from "react";
/**
 * This provider is the thing you mount in the app to "give access to Pusher"
 *
 * Note: MAKE SURE THIS IS NOT SSR'D
 */
export const PusherProvider: React.FC<
  React.PropsWithChildren<{ slug: string }>
> = ({ slug, children }) => {
  return (
    <PusherZustandStoreProvider
      createStore={() => reactZustandCreate(createPusherStore(slug))}
    >
      {children}
    </PusherZustandStoreProvider>
  );
};

/**
 * Section 3: "The Hooks"
 *
 * The exported hooks you use to interact with this store (in this case just an event sub)
 */
export function useSubscribeToEvent<MessageType>(
  eventName: string,
  callback: (data: MessageType) => void
) {
  const channel = usePusherStore((state) => state.channel);

  const stableCallback = React.useRef(callback);

  // Keep callback sync'd
  React.useEffect(() => {
    stableCallback.current = callback;
  }, [callback]);

  React.useEffect(() => {
    const reference = (data: MessageType) => {
      stableCallback.current(data);
    };
    channel.bind(eventName, reference);
    return () => {
      channel.unbind(eventName, reference);
    };
  }, [channel, eventName]);
}

export const useCurrentMemberCount = () =>
  usePusherStore((s) => Object.keys(s.members).length);
