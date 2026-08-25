import { MESSAGE_TYPES } from './shared/messages.js';

function getElement(document, selector) {
	const element = document.querySelector(selector);
	if (!element) {
		throw new Error(`Popup element ${selector} is missing.`);
	}
	return element;
}

export function initializePopup(document, runtime) {
	const pngButton = getElement(document, '#png');
	const pdfButton = getElement(document, '#pdf');
	const status = getElement(document, '#status');
	let selectedFormat = null;

	function setStatus(message, state = '') {
		status.textContent = message;
		status.dataset.state = state;
	}

	function setBusy(isBusy) {
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
			await runtime.sendMessage({ type: MESSAGE_TYPES.START_CAPTURE, format });
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
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
	initializePopup(document, chrome.runtime);
}
