import { afterEach, expect, it, vi } from 'vitest';

function createElement() {
	return {
		disabled: false,
		value: '',
		textContent: '',
		dataset: {},
		listeners: new Map(),
		addEventListener(type, listener) {
			this.listeners.set(type, listener);
		},
		click() {
			this.listeners.get('click')?.();
		}
	};
}

function createPopupDocument() {
	const elements = {
		'#filename': createElement(),
		'#png': createElement(),
		'#pdf': createElement(),
		'#status': createElement()
	};
	return {
		elements,
		querySelector(selector) {
			return elements[selector];
		}
	};
}

afterEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

it('starts the selected format and renders capture lifecycle messages', async () => {
	const popupDocument = createPopupDocument();
	const listener = vi.fn();
	const runtime = {
		onMessage: { addListener: listener },
		sendMessage: vi.fn().mockResolvedValue(undefined)
	};
	const tabs = {
		query: vi.fn().mockResolvedValue([{ title: 'Example article' }])
	};
	const { initializePopup } = await import('../src/popup.js');
	initializePopup(popupDocument, runtime, tabs);
	await Promise.resolve();
	expect(popupDocument.elements['#filename'].value).toBe('Example article');
	popupDocument.elements['#filename'].value = 'My capture';

	popupDocument.elements['#pdf'].click();

	expect(runtime.sendMessage).toHaveBeenCalledWith({
		type: 'START_CAPTURE',
		format: 'pdf',
		filename: 'My capture'
	});
	expect(popupDocument.elements['#status'].textContent).toBe('Preparing capture…');
	expect(popupDocument.elements['#png'].disabled).toBe(true);
	expect(popupDocument.elements['#pdf'].disabled).toBe(true);

	listener.mock.calls[0][0]({ type: 'CAPTURE_PROGRESS', completed: 2, total: 4 });
	expect(popupDocument.elements['#status'].textContent).toBe('Captured 2 of 4 viewports');
	listener.mock.calls[0][0]({ type: 'CAPTURE_PROGRESS', completed: 4, total: 4 });
	expect(popupDocument.elements['#status'].textContent).toBe('Captured 4 of 4 viewports');
	listener.mock.calls[0][0]({ type: 'CAPTURE_PROGRESS', completed: 4, total: 4, exporting: true });
	expect(popupDocument.elements['#status'].textContent).toBe('Creating PDF…');
	listener.mock.calls[0][0]({ type: 'CAPTURE_COMPLETE' });
	expect(popupDocument.elements['#status'].textContent).toBe('Capture complete.');
	expect(popupDocument.elements['#png'].disabled).toBe(false);

	popupDocument.elements['#png'].click();
	listener.mock.calls[0][0]({ type: 'CAPTURE_ERROR', error: 'Page unavailable.' });
	expect(popupDocument.elements['#status'].textContent).toBe('Capture failed: Page unavailable.');
	expect(popupDocument.elements['#pdf'].disabled).toBe(false);
});
