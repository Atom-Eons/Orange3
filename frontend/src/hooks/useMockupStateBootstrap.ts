import { useEffect, useRef } from "react";
import { applyMockupState } from "../engine/mockupStateRuntime";
import { mockupStateBank } from "../engine/mockupStateBank";

interface SeeSuiteWindow extends Window {
  __AE_SEE_SUITE_APPLY_STATE__?: (id: string | number) => void;
  __AE_SEE_SUITE_STATE_BANK__?: typeof mockupStateBank;
}

export function useMockupStateBootstrap() {
  const appliedInitialState = useRef(false);

  useEffect(() => {
    const seeSuiteWindow = window as SeeSuiteWindow;

    seeSuiteWindow.__AE_SEE_SUITE_STATE_BANK__ = mockupStateBank;
    seeSuiteWindow.__AE_SEE_SUITE_APPLY_STATE__ = (id: string | number) => {
      applyMockupState(id);
    };

    if (appliedInitialState.current) return;
    appliedInitialState.current = true;

    const params = new URLSearchParams(window.location.search);
    const requestedState = params.get("state") ?? params.get("mockupState");

    if (requestedState) {
      window.setTimeout(() => applyMockupState(requestedState), 80);
    }

    return () => {
      delete seeSuiteWindow.__AE_SEE_SUITE_STATE_BANK__;
      delete seeSuiteWindow.__AE_SEE_SUITE_APPLY_STATE__;
    };
  }, []);
}
