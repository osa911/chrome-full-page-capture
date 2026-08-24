(() => {
  // src/shared/messages.js
  var MESSAGE_TYPES = Object.freeze({
    START_CAPTURE: "START_CAPTURE",
    GET_METRICS: "GET_METRICS",
    SCROLL_TO: "SCROLL_TO",
    RESTORE_SCROLL: "RESTORE_SCROLL",
    CAPTURE_PROGRESS: "CAPTURE_PROGRESS",
    CAPTURE_COMPLETE: "CAPTURE_COMPLETE",
    CAPTURE_ERROR: "CAPTURE_ERROR"
  });

  // src/popup.js
  function getElement(document2, selector) {
    const element = document2.querySelector(selector);
    if (!element) {
      throw new Error(`Popup element ${selector} is missing.`);
    }
    return element;
  }
  function initializePopup(document2, runtime) {
    const pngButton = getElement(document2, "#png");
    const pdfButton = getElement(document2, "#pdf");
    const status = getElement(document2, "#status");
    let selectedFormat = null;
    function setStatus(message, state = "") {
      status.textContent = message;
      status.dataset.state = state;
    }
    function setBusy(isBusy) {
      pngButton.disabled = isBusy;
      pdfButton.disabled = isBusy;
    }
    function showError(error) {
      const message = typeof error === "string" && error.length > 0 ? error : "The capture could not be completed.";
      setStatus(`Capture failed: ${message}`, "error");
      setBusy(false);
      selectedFormat = null;
    }
    async function startCapture(format) {
      selectedFormat = format;
      setStatus("Preparing capture\u2026");
      setBusy(true);
      try {
        await runtime.sendMessage({ type: MESSAGE_TYPES.START_CAPTURE, format });
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    }
    pngButton.addEventListener("click", () => void startCapture("png"));
    pdfButton.addEventListener("click", () => void startCapture("pdf"));
    runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object") {
        return;
      }
      switch (message.type) {
        case MESSAGE_TYPES.CAPTURE_PROGRESS:
          if (message.exporting === true) {
            setStatus("Creating PDF\u2026");
          } else {
            setStatus(`Captured ${message.completed} of ${message.total} viewports`);
          }
          break;
        case MESSAGE_TYPES.CAPTURE_COMPLETE:
          setStatus("Capture complete.");
          setBusy(false);
          selectedFormat = null;
          break;
        case MESSAGE_TYPES.CAPTURE_ERROR:
          showError(message.error);
          break;
        default:
          break;
      }
    });
  }
  if (typeof document !== "undefined" && typeof chrome !== "undefined") {
    initializePopup(document, chrome.runtime);
  }
})();
