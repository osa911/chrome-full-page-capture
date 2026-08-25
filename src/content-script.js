import { MESSAGE_TYPES } from './shared/messages.js';

const listenerInstalledKey = '__fullPageCaptureMessageListenerInstalled__';

function getLargestDocumentDimension(dimension) {
	const values = [document.documentElement, document.body]
		.filter((element) => element !== null)
		.flatMap((element) => [
			element[`scroll${dimension}`],
			element[`offset${dimension}`],
			element[`client${dimension}`]
		])
		.filter((value) => Number.isFinite(value) && value >= 0);

	return Math.max(0, ...values);
}

function getScrollPosition() {
	return {
		scrollX: Number.isFinite(window.scrollX) ? window.scrollX : window.pageXOffset,
		scrollY: Number.isFinite(window.scrollY) ? window.scrollY : window.pageYOffset
	};
}

function getMetrics() {
	return {
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
		documentWidth: getLargestDocumentDimension('Width'),
		documentHeight: getLargestDocumentDimension('Height'),
		pixelRatio: window.devicePixelRatio,
		...getScrollPosition()
	};
}

function waitForAnimationFrame() {
	return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function scrollTo(scrollY) {
	window.scrollTo({ top: scrollY, behavior: 'instant' });
	await waitForAnimationFrame();
	await waitForAnimationFrame();
	return getScrollPosition();
}

function restoreScroll({ scrollX, scrollY }) {
	window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
	return { restored: true };
}

if (!globalThis[listenerInstalledKey]) {
	globalThis[listenerInstalledKey] = true;
	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		let response;
		if (message?.type === MESSAGE_TYPES.GET_METRICS) {
			response = Promise.resolve().then(getMetrics);
		} else if (message?.type === MESSAGE_TYPES.SCROLL_TO) {
			response = Promise.resolve().then(() => scrollTo(message.scrollY));
		} else if (message?.type === MESSAGE_TYPES.RESTORE_SCROLL) {
			response = Promise.resolve().then(() => restoreScroll(message));
		} else {
			return false;
		}

		void response.then(sendResponse, (error) => {
			sendResponse({ error: error instanceof Error ? error.message : String(error) });
		});
		return true;
	});
}
