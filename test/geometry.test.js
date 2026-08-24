import { createCapturePositions } from '../src/capture/geometry.js';
import { describe, expect, it } from 'vitest';

describe('capture geometry', () => {
	 it('exports the capture position function', () => {
		 expect(createCapturePositions).toBeTypeOf('function');
	 });
});
