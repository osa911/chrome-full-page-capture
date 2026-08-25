import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.resetModules();
	vi.unstubAllGlobals();
	delete globalThis.__fullPageCaptureMessageListenerInstalled__;
});

it('reports the largest document dimensions and the current viewport position', async () => {
	let listener;
	vi.stubGlobal('window', {
		devicePixelRatio: 2,
		innerHeight: 700,
		innerWidth: 900,
		pageXOffset: 12,
		pageYOffset: 34
	});
	vi.stubGlobal('document', {
		body: { offsetHeight: 1400, offsetWidth: 1100, scrollHeight: 1500, scrollWidth: 1200 },
		documentElement: { offsetHeight: 1600, offsetWidth: 1000, scrollHeight: 1550, scrollWidth: 1300 }
	});
	vi.stubGlobal('chrome', {
		runtime: {
			onMessage: {
				addListener(callback) {
					listener = callback;
				}
			}
		}
	});

	await import('../src/content-script.js');

	const response = await new Promise((resolve) => {
		const keepsChannelOpen = listener({ type: 'GET_METRICS' }, {}, resolve);
		expect(keepsChannelOpen).toBe(true);
	});

	expect(response).toEqual({
		viewportWidth: 900,
		viewportHeight: 700,
		documentWidth: 1300,
		documentHeight: 1600,
		pixelRatio: 2,
		scrollX: 12,
		scrollY: 34
	});
});

it('returns the settled scroll position after two animation frames', async () => {
	let listener;
	const animationFrame = vi.fn((callback) => callback());
	const scrollTo = vi.fn(() => {
		window.scrollX = 8;
		window.scrollY = 610;
	});
	vi.stubGlobal('window', {
		scrollX: 0,
		scrollY: 0,
		scrollTo
	});
	vi.stubGlobal('requestAnimationFrame', animationFrame);
	vi.stubGlobal('chrome', {
		runtime: {
			onMessage: {
				addListener(callback) {
					listener = callback;
				}
			}
		}
	});

	await import('../src/content-script.js');

	const response = await new Promise((resolve) => {
		listener({ type: 'SCROLL_TO', scrollY: 600 }, {}, resolve);
	});

	expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'instant' });
	expect(animationFrame).toHaveBeenCalledTimes(2);
	expect(response).toEqual({ scrollX: 8, scrollY: 610 });
});

it('restores both original scroll coordinates', async () => {
	let listener;
	const scrollTo = vi.fn();
	vi.stubGlobal('window', { scrollTo });
	vi.stubGlobal('chrome', {
		runtime: {
			onMessage: {
				addListener(callback) {
					listener = callback;
				}
			}
		}
	});

	await import('../src/content-script.js');

	const response = await new Promise((resolve) => {
		listener({ type: 'RESTORE_SCROLL', scrollX: 45, scrollY: 90 }, {}, resolve);
	});

	expect(scrollTo).toHaveBeenCalledWith({ left: 45, top: 90, behavior: 'instant' });
	expect(response).toEqual({ restored: true });
});

it('does not register duplicate listeners when a later capture reinjects the script', async () => {
	const addListener = vi.fn();
	vi.stubGlobal('chrome', { runtime: { onMessage: { addListener } } });

	await import('../src/content-script.js?first-injection');
	await import('../src/content-script.js?second-injection');

	expect(addListener).toHaveBeenCalledTimes(1);
});

it('returns a failure response when metric collection throws synchronously', async () => {
	let listener;
	vi.stubGlobal('window', {
		get innerWidth() {
			throw new Error('Metric collection failed.');
		}
	});
	vi.stubGlobal('chrome', {
		runtime: {
			onMessage: {
				addListener(callback) {
					listener = callback;
				}
			}
		}
	});

	await import('../src/content-script.js');

	const response = new Promise((resolve) => {
		expect(() => listener({ type: 'GET_METRICS' }, {}, resolve)).not.toThrow();
	});

	expect(await response).toEqual({ error: 'Metric collection failed.' });
});
