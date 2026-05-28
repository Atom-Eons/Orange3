import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { savePersistedSession } from "../store/persistence";

export function usePersistentStore() {
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state) => savePersistedSession(state));
    return unsubscribe;
  }, []);
}
