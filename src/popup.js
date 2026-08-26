import { MESSAGE_TYPES } from './shared/messages.js';

function getElement(document, selector) {
	const element = document.querySelector(selector);
	if (!element) {
		throw new Error(`Popup element ${selector} is missing.`);
	}
	return element;
}

export function initializePopup(document, runtime, tabs) {
	const filenameInput = getElement(document, '#filename');
	const pngButton = getElement(document, '#png');
	const pdfButton = getElement(document, '#pdf');
	const status = getElement(document, '#status');
	let selectedFormat = null;
	let filenameEdited = false;

	filenameInput.addEventListener('input', () => {
		filenameEdited = true;
	});

	function setStatus(message, state = '') {
		status.textContent = message;
		status.dataset.state = state;
	}

	function setBusy(isBusy) {
		filenameInput.disabled = isBusy;
		pngButton.disabled = isBusy;
		pdfButton.disabled = isBusy;
	}

	function showError(error) {
		const message = typeof error === 'string' && error.length > 0
			? error
			: 'The capture could not be completed.';
		setStatus(`Capture failed: ${message}`, 'error');
		setBusy(false);
		selectedFormat = null;
	}

	async function startCapture(format) {
		selectedFormat = format;
		setStatus('Preparing capture…');
		setBusy(true);

		try {
			await runtime.sendMessage({
				type: MESSAGE_TYPES.START_CAPTURE,
				format,
				filename: filenameInput.value.trim() || 'capture'
			});
		} catch (error) {
			showError(error instanceof Error ? error.message : String(error));
		}
	}

	pngButton.addEventListener('click', () => void startCapture('png'));
	pdfButton.addEventListener('click', () => void startCapture('pdf'));
	runtime.onMessage.addListener((message) => {
		if (!message || typeof message !== 'object') {
			return;
		}

		switch (message.type) {
			case MESSAGE_TYPES.CAPTURE_PROGRESS:
				if (message.exporting === true) {
					setStatus('Creating PDF…');
				} else {
					setStatus(`Captured ${message.completed} of ${message.total} viewports`);
				}
				break;
			case MESSAGE_TYPES.CAPTURE_COMPLETE:
				setStatus('Capture complete.');
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

	filenameInput.value = 'capture';
	if (tabs?.query) {
		void tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
			if (!filenameEdited && typeof tab?.title === 'string' && tab.title.trim()) {
				filenameInput.value = tab.title;
			}
		}).catch(() => {
			// The fallback filename is already available if the active tab is restricted.
		});
	}
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
	initializePopup(document, chrome.runtime, chrome.tabs);
}
