import { createCapturePositions } from './capture/geometry.js';
import { createPdfFromPng } from './capture/pdf-exporter.js';
import { stitchFrames } from './capture/stitcher.js';
import { isCaptureRequest, MESSAGE_TYPES } from './shared/messages.js';

const CAPTURE_INTERVAL_MS = 500;

function getErrorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function wait(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getContentScriptResponse(response) {
	if (response !== null && typeof response === 'object' && 'error' in response) {
		const message = response.error;
		throw new Error(typeof message === 'string' && message.length > 0
			? message
			: 'The page control script failed.');
	}

	return response;
}

function isPositiveNumber(value) {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isScrollCoordinate(value) {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function getMetrics(response) {
	const metrics = getContentScriptResponse(response);
	if (metrics === null || typeof metrics !== 'object'
		|| !isPositiveNumber(metrics.viewportWidth)
		|| !isPositiveNumber(metrics.viewportHeight)
		|| !isPositiveNumber(metrics.documentWidth)
		|| !isPositiveNumber(metrics.documentHeight)
		|| !isPositiveNumber(metrics.pixelRatio)
		|| !isScrollCoordinate(metrics.scrollX)
		|| !isScrollCoordinate(metrics.scrollY)) {
		throw new Error('Capture metrics are invalid.');
	}

	return metrics;
}

function getScrollPosition(response) {
	const position = getContentScriptResponse(response);
	if (position === null || typeof position !== 'object'
		|| !isScrollCoordinate(position.scrollX)
		|| !isScrollCoordinate(position.scrollY)) {
		throw new Error('Capture scroll position is invalid.');
	}

	return position;
}

function getRestoration(response) {
	const result = getContentScriptResponse(response);
	if (result === null || typeof result !== 'object' || result.restored !== true) {
		throw new Error('The page did not confirm scroll restoration.');
	}
}

async function sendContentScriptMessage(tabId, message) {
	return getContentScriptResponse(await chrome.tabs.sendMessage(tabId, message));
}

async function blobToDataUrl(blob) {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}

	return `data:${blob.type};base64,${btoa(binary)}`;
}

async function restoreScroll(tabId, initialScroll, captureError) {
	try {
		await chrome.tabs.get(tabId);
		getRestoration(await sendContentScriptMessage(tabId, {
			type: MESSAGE_TYPES.RESTORE_SCROLL,
			...initialScroll
		}));
	} catch (error) {
		if (!captureError) {
			throw new Error(`Unable to restore the page scroll position: ${getErrorMessage(error)}`);
		}
	}
}

async function downloadBlob(blob, format) {
	const filename = `full-page-capture.${format}`;
	const downloadId = await chrome.downloads.download({
		url: await blobToDataUrl(blob),
		filename,
		saveAs: true
	});
	return { downloadId, filename };
}

export async function captureTab(tabId, format) {
	if (format !== 'png' && format !== 'pdf') {
		throw new Error('Capture format must be png or pdf.');
	}

	const tab = await chrome.tabs.get(tabId);
	if (!Number.isInteger(tab?.windowId)) {
		throw new Error('The tab is no longer available.');
	}

	await chrome.scripting.executeScript({
		target: { tabId },
		files: ['content-script.js']
	});
	const metrics = getMetrics(await sendContentScriptMessage(tabId, { type: MESSAGE_TYPES.GET_METRICS }));
	const initialScroll = { scrollX: metrics.scrollX, scrollY: metrics.scrollY };
	const positions = createCapturePositions({
		documentHeight: metrics.documentHeight,
		viewportHeight: metrics.viewportHeight
	});
	const frames = [];
	let captureError;

	try {
		for (const scrollY of positions) {
			const actualPosition = getScrollPosition(await sendContentScriptMessage(tabId, {
				type: MESSAGE_TYPES.SCROLL_TO,
				scrollY
			}));
			await wait(CAPTURE_INTERVAL_MS);

			const [activeTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
			if (activeTab?.id !== tabId) {
				throw new Error('Capture canceled because the active tab changed.');
			}

			const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
			if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
				throw new Error('Chrome did not return an image for this capture.');
			}
			frames.push({ dataUrl, scrollY: actualPosition.scrollY });
			await chrome.runtime.sendMessage({
				type: MESSAGE_TYPES.CAPTURE_PROGRESS,
				completed: frames.length,
				total: positions.length
			});
		}
	} catch (error) {
		captureError = error;
		throw error;
	} finally {
		await restoreScroll(tabId, initialScroll, captureError);
	}

	const png = await stitchFrames({
		frames,
		documentWidth: metrics.documentWidth,
		documentHeight: metrics.documentHeight,
		viewportHeight: metrics.viewportHeight,
		pixelRatio: metrics.pixelRatio
	});
	let output = png;
	if (format === 'pdf') {
		await chrome.runtime.sendMessage({
			type: MESSAGE_TYPES.CAPTURE_PROGRESS,
			completed: frames.length,
			total: positions.length,
			exporting: true
		});
		output = await createPdfFromPng(png);
	}
	return downloadBlob(output, format);
}

async function startCapture(format) {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!Number.isInteger(tab?.id)) {
		throw new Error('No active tab is available.');
	}

	return captureTab(tab.id, format);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!isCaptureRequest(message)) {
		return false;
	}

	void startCapture(message.format).then(
		async (result) => {
			await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CAPTURE_COMPLETE, ...result });
			sendResponse(result);
		},
		async (error) => {
			const message = getErrorMessage(error);
			await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CAPTURE_ERROR, error: message });
			sendResponse({ error: message });
		}
	);
	return true;
});
