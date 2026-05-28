import { useEffect, useRef } from "react";
import { applyStatePreset } from "./applyStatePreset";
import { statePresets } from "./statePresets";

interface SeeSuiteWindow extends Window {
  __AE_SEE_SUITE_APPLY_STATE__?: (id: string | number) => void;
  __AE_SEE_SUITE_STATE_BANK__?: typeof statePresets;
  __AE_SEE_SUITE_STATE_PRESETS__?: typeof statePresets;
}

export function usePresetFromUrl() {
  const appliedInitialState = useRef(false);

  useEffect(() => {
    const seeSuiteWindow = window as SeeSuiteWindow;

    seeSuiteWindow.__AE_SEE_SUITE_STATE_PRESETS__ = statePresets;
    seeSuiteWindow.__AE_SEE_SUITE_STATE_BANK__ = statePresets;
    seeSuiteWindow.__AE_SEE_SUITE_APPLY_STATE__ = (id: string | number) => {
      applyStatePreset(id);
    };

    if (!appliedInitialState.current) {
      appliedInitialState.current = true;

      const params = new URLSearchParams(window.location.search);
      const requestedState = params.get("state") ?? params.get("mockupState");

      if (requestedState) {
        window.setTimeout(() => applyStatePreset(requestedState), 80);
      }
    }

    return () => {
      delete seeSuiteWindow.__AE_SEE_SUITE_STATE_PRESETS__;
      delete seeSuiteWindow.__AE_SEE_SUITE_STATE_BANK__;
      delete seeSuiteWindow.__AE_SEE_SUITE_APPLY_STATE__;
    };
  }, []);
}
