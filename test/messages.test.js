import { describe, expect, it } from 'vitest';
import { isCaptureRequest, MESSAGE_TYPES } from '../src/shared/messages.js';

describe('capture messages', () => {
	it('accepts a PNG request', () => {
		 expect(isCaptureRequest({ type: MESSAGE_TYPES.START_CAPTURE, format: 'png' })).toBe(true);
	 });

	it('accepts a PNG request with a filename', () => {
		expect(isCaptureRequest({
			type: MESSAGE_TYPES.START_CAPTURE,
			format: 'png',
			filename: 'Example article'
		})).toBe(true);
	});

	it('rejects unknown formats and unrelated messages', () => {
		 expect(isCaptureRequest({ type: MESSAGE_TYPES.START_CAPTURE, format: 'jpeg' })).toBe(false);
		 expect(isCaptureRequest({
			type: MESSAGE_TYPES.START_CAPTURE,
			format: 'png',
			filename: 42
		})).toBe(false);
		 expect(isCaptureRequest({ type: 'unknown' })).toBe(false);
	 });
});
