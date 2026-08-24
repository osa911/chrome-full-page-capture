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
		await chrome.tabs.sendMessage(tabId, {
			type: MESSAGE_TYPES.RESTORE_SCROLL,
			...initialScroll
		});
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
	const metrics = await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.GET_METRICS });
	const initialScroll = { scrollX: metrics.scrollX, scrollY: metrics.scrollY };
	const positions = createCapturePositions({
		documentHeight: metrics.documentHeight,
		viewportHeight: metrics.viewportHeight
	});
	const frames = [];
	let captureError;

	try {
		for (const scrollY of positions) {
			const actualPosition = await chrome.tabs.sendMessage(tabId, {
				type: MESSAGE_TYPES.SCROLL_TO,
				scrollY
			});
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
	const output = format === 'pdf' ? await createPdfFromPng(png) : png;
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
