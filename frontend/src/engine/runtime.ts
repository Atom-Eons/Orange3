let activeAbortController: AbortController | undefined;

export function setActiveAbortController(controller?: AbortController) {
  activeAbortController = controller;
}

export function getActiveAbortController() {
  return activeAbortController;
}

export function abortActiveRun() {
  activeAbortController?.abort();
  activeAbortController = undefined;
}
