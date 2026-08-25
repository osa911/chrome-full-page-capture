import { afterEach, expect, it, vi } from 'vitest';

const { createPdfFromPng, stitchFrames } = vi.hoisted(() => ({
	createPdfFromPng: vi.fn(),
	stitchFrames: vi.fn()
}));

vi.mock('../src/capture/pdf-exporter.js', () => ({ createPdfFromPng }));
vi.mock('../src/capture/stitcher.js', () => ({ stitchFrames }));

const metrics = Object.freeze({
	viewportWidth: 800,
	viewportHeight: 600,
	documentWidth: 800,
	documentHeight: 1400,
	pixelRatio: 1,
	scrollX: 10,
	scrollY: 20
});

function installChrome({ activeTabId = 7, responseForMessage } = {}) {
	let listener;
	const captureTimes = [];
	const captureResults = [
		'data:image/png;base64,first',
		'data:image/png;base64,second',
		'data:image/png;base64,third'
	];
	const runtimeSendMessage = vi.fn().mockResolvedValue(undefined);
	const tabSendMessage = vi.fn(async (_tabId, message) => {
		const customResponse = responseForMessage?.(message);
		if (customResponse !== undefined) {
			return customResponse;
		}
		if (message.type === 'GET_METRICS') {
			return metrics;
		}
		if (message.type === 'SCROLL_TO') {
			return { scrollX: 10, scrollY: message.scrollY };
		}
		if (message.type === 'RESTORE_SCROLL') {
			return { restored: true };
		}
		throw new Error(`Unexpected message ${message.type}`);
	});
	const chrome = {
		downloads: { download: vi.fn().mockResolvedValue(42) },
		runtime: {
			onMessage: { addListener(callback) { listener = callback; } },
			sendMessage: runtimeSendMessage
		},
		scripting: { executeScript: vi.fn().mockResolvedValue(undefined) },
		tabs: {
			MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND: 2,
			captureVisibleTab: vi.fn().mockImplementation(async () => {
				captureTimes.push(Date.now());
				return captureResults.shift();
			}),
			get: vi.fn().mockResolvedValue({ id: 7, windowId: 4 }),
			query: vi.fn().mockResolvedValue([{ id: activeTabId, windowId: 4 }]),
			sendMessage: tabSendMessage
		}
	};

	vi.stubGlobal('chrome', chrome);
	return { chrome, captureTimes, getListener: () => listener };
}

afterEach(() => {
	vi.resetModules();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	vi.clearAllMocks();
});

it('captures the active tab, restores its scroll position, and downloads the stitched PNG', async () => {
	vi.useFakeTimers();
	const { chrome, captureTimes, getListener } = installChrome();
	stitchFrames.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

	await import('../src/service-worker.js');
	const response = new Promise((resolve) => {
		expect(getListener()({ type: 'START_CAPTURE', format: 'png' }, {}, resolve)).toBe(true);
	});
	await vi.advanceTimersByTimeAsync(1650);

	expect(await response).toEqual({ downloadId: 42, filename: 'full-page-capture.png' });
	expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
		target: { tabId: 7 },
		files: ['content-script.js']
	});
	expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(3);
	expect(captureTimes[2] - captureTimes[0]).toBeGreaterThanOrEqual(1000);
	expect(stitchFrames).toHaveBeenCalledWith({
		frames: [
			{ dataUrl: 'data:image/png;base64,first', scrollY: 0 },
			{ dataUrl: 'data:image/png;base64,second', scrollY: 600 },
			{ dataUrl: 'data:image/png;base64,third', scrollY: 800 }
		],
		documentWidth: 800,
		documentHeight: 1400,
		viewportHeight: 600,
		pixelRatio: 1
	});
	expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(7, {
		type: 'RESTORE_SCROLL',
		scrollX: 10,
		scrollY: 20
	});
	expect(chrome.downloads.download).toHaveBeenCalledWith({
		url: 'data:image/png;base64,cG5n',
		filename: 'full-page-capture.png',
		saveAs: true
	});
});

it('exports a PDF only after every frame succeeds', async () => {
	vi.useFakeTimers();
	const { chrome } = installChrome();
	const png = new Blob(['png'], { type: 'image/png' });
	stitchFrames.mockResolvedValue(png);
	createPdfFromPng.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));

	const { captureTab } = await import('../src/service-worker.js');
	const capture = captureTab(7, 'pdf');
	await vi.advanceTimersByTimeAsync(1650);

	expect(await capture).toEqual({ downloadId: 42, filename: 'full-page-capture.pdf' });
	expect(createPdfFromPng).toHaveBeenCalledWith(png);
	expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
		type: 'CAPTURE_PROGRESS',
		completed: 3,
		total: 3,
		exporting: true
	});
	expect(chrome.downloads.download).toHaveBeenCalledWith({
		url: 'data:application/pdf;base64,cGRm',
		filename: 'full-page-capture.pdf',
		saveAs: true
	});
});

it('cancels if the original window activates another tab and still restores the original tab', async () => {
	vi.useFakeTimers();
	const { chrome } = installChrome({ activeTabId: 9 });
	stitchFrames.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

	const { captureTab } = await import('../src/service-worker.js');
	const capture = captureTab(7, 'png');
	const rejection = expect(capture).rejects.toThrow('Capture canceled because the active tab changed.');
	await vi.advanceTimersByTimeAsync(550);

	await rejection;
	expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
	expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(7, {
		type: 'RESTORE_SCROLL',
		scrollX: 10,
		scrollY: 20
	});
	expect(chrome.downloads.download).not.toHaveBeenCalled();
});

it('does not capture or download when the content script reports a scroll error', async () => {
	vi.useFakeTimers();
	const { chrome } = installChrome({
		responseForMessage(message) {
			return message.type === 'SCROLL_TO' ? { error: 'Page scroll failed.' } : undefined;
		}
	});
	stitchFrames.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

	const { captureTab } = await import('../src/service-worker.js');
	const capture = captureTab(7, 'png');
	void capture.catch(() => {});
	await vi.advanceTimersByTimeAsync(1650);

	await expect(capture).rejects.toThrow('Page scroll failed.');
	expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
	expect(stitchFrames).not.toHaveBeenCalled();
	expect(chrome.downloads.download).not.toHaveBeenCalled();
});

it('does not capture or download when metrics are malformed', async () => {
	vi.useFakeTimers();
	const { chrome } = installChrome({
		responseForMessage(message) {
			return message.type === 'GET_METRICS' ? { ...metrics, documentWidth: 0 } : undefined;
		}
	});
	stitchFrames.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

	const { captureTab } = await import('../src/service-worker.js');
	const capture = captureTab(7, 'png');
	void capture.catch(() => {});
	await vi.advanceTimersByTimeAsync(1650);

	await expect(capture).rejects.toThrow('Capture metrics are invalid.');
	expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
	expect(stitchFrames).not.toHaveBeenCalled();
	expect(chrome.downloads.download).not.toHaveBeenCalled();
});

it('rejects pages wider than the viewport before capture', async () => {
	vi.useFakeTimers();
	const { chrome } = installChrome({
		responseForMessage(message) {
			return message.type === 'GET_METRICS'
				? { ...metrics, documentWidth: 801 }
				: undefined;
		}
	});
	stitchFrames.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

	const { captureTab } = await import('../src/service-worker.js');
	const capture = captureTab(7, 'png');
	void capture.catch(() => {});
	await vi.advanceTimersByTimeAsync(1650);

	await expect(capture).rejects.toThrow('Full-page capture does not support pages wider than the viewport.');
	expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
	expect(stitchFrames).not.toHaveBeenCalled();
	expect(chrome.downloads.download).not.toHaveBeenCalled();
});

it('downloads and responds when runtime notifications cannot be delivered', async () => {
	vi.useFakeTimers();
	const { chrome, getListener } = installChrome();
	chrome.runtime.sendMessage.mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
	stitchFrames.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

	await import('../src/service-worker.js');
	const response = new Promise((resolve) => {
		expect(getListener()({ type: 'START_CAPTURE', format: 'png' }, {}, resolve)).toBe(true);
	});
	const terminalResult = Promise.race([
		response,
		new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 1800))
	]);
	await vi.advanceTimersByTimeAsync(1800);

	expect(await terminalResult).toEqual({ downloadId: 42, filename: 'full-page-capture.png' });
	expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
});

it('rejects a concurrent capture request while the first capture is running', async () => {
	vi.useFakeTimers();
	const { chrome, getListener } = installChrome({
		responseForMessage(message) {
			return message.type === 'GET_METRICS'
				? { ...metrics, documentHeight: 600 }
				: undefined;
		}
	});
	stitchFrames.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

	await import('../src/service-worker.js');
	const firstResponse = new Promise((resolve) => {
		expect(getListener()({ type: 'START_CAPTURE', format: 'png' }, {}, resolve)).toBe(true);
	});
	const secondResponse = new Promise((resolve) => {
		expect(getListener()({ type: 'START_CAPTURE', format: 'png' }, {}, resolve)).toBe(true);
	});
	const secondResult = Promise.race([
		secondResponse,
		new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 1))
	]);
	await vi.advanceTimersByTimeAsync(1);

	expect(await secondResult).toEqual({ error: 'Capture already running.' });
	await vi.advanceTimersByTimeAsync(549);
	expect(await firstResponse).toEqual({ downloadId: 42, filename: 'full-page-capture.png' });
	expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(1);
	expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
});

it('does not capture or download when the content script returns invalid scroll coordinates', async () => {
	vi.useFakeTimers();
	const { chrome } = installChrome({
		responseForMessage(message) {
			return message.type === 'SCROLL_TO' ? { scrollX: 10, scrollY: Number.NaN } : undefined;
		}
	});
	stitchFrames.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

	const { captureTab } = await import('../src/service-worker.js');
	const capture = captureTab(7, 'png');
	void capture.catch(() => {});
	await vi.advanceTimersByTimeAsync(1650);

	await expect(capture).rejects.toThrow('Capture scroll position is invalid.');
	expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
	expect(stitchFrames).not.toHaveBeenCalled();
	expect(chrome.downloads.download).not.toHaveBeenCalled();
});

it('does not download when the content script reports a restoration error', async () => {
	vi.useFakeTimers();
	const { chrome } = installChrome({
		responseForMessage(message) {
			if (message.type === 'GET_METRICS') {
				return { ...metrics, documentHeight: 600 };
			}
			return message.type === 'RESTORE_SCROLL' ? { error: 'Page restoration failed.' } : undefined;
		}
	});
	stitchFrames.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

	const { captureTab } = await import('../src/service-worker.js');
	const capture = captureTab(7, 'png');
	void capture.catch(() => {});
	await vi.advanceTimersByTimeAsync(550);

	await expect(capture).rejects.toThrow('Page restoration failed.');
	expect(stitchFrames).not.toHaveBeenCalled();
	expect(chrome.downloads.download).not.toHaveBeenCalled();
});
