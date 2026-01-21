"use client";

import { useEffect, useState, useRef } from "react";
import { DataSnapshot } from "firebase/database";
import {
  database,
  ref,
  onValue,
  onDisconnect,
  set,
  serverTimestamp,
  generateSessionId,
} from "./firebase";

export function usePresence() {
  const [soulsOnline, setSoulsOnline] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Generate a unique session ID for this tab
    if (!sessionIdRef.current) {
      sessionIdRef.current = generateSessionId();
    }
    const sessionId = sessionIdRef.current;

    // Reference to this user's presence
    const myPresenceRef = ref(database, `presence/${sessionId}`);

    // Reference to all presence data
    const presenceRef = ref(database, "presence");

    // Reference to connection state
    const connectedRef = ref(database, ".info/connected");

    // Listen for connection state changes
    const unsubscribeConnected = onValue(connectedRef, (snapshot: DataSnapshot) => {
      const connected = snapshot.val() === true;

      if (connected) {
        setIsConnected(true);

        // Mark this user as online
        set(myPresenceRef, {
          online: true,
          lastSeen: serverTimestamp(),
        });

        // When this client disconnects, remove presence
        onDisconnect(myPresenceRef).remove();
      } else {
        setIsConnected(false);
      }
    });

    // Listen for presence changes to count souls
    const unsubscribePresence = onValue(presenceRef, (snapshot: DataSnapshot) => {
      const presenceData = snapshot.val();
      if (presenceData) {
        const count = Object.keys(presenceData).length;
        setSoulsOnline(count);
      } else {
        setSoulsOnline(0);
      }
    });

    // Cleanup on unmount
    return () => {
      unsubscribeConnected();
      unsubscribePresence();
      // Remove presence when component unmounts
      set(myPresenceRef, null);
    };
  }, []);

  return { soulsOnline, isConnected };
}
