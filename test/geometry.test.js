import { createCapturePositions, computeFramePlacement } from '../src/capture/geometry.js';
import { describe, expect, it } from 'vitest';

describe('capture geometry', () => {
	 it('exports the capture position function', () => {
		 expect(createCapturePositions).toBeTypeOf('function');
	 });

	 it('captures a page shorter than the viewport once', () => {
		 expect(createCapturePositions({ documentHeight: 600, viewportHeight: 900 })).toEqual([0]);
	 });

	 it('includes the final aligned position for a partial viewport', () => {
		 expect(createCapturePositions({ documentHeight: 2100, viewportHeight: 900 })).toEqual([0, 900, 1200]);
	 });

	 it('crops the overlap from the final frame', () => {
		 expect(computeFramePlacement({
			 previousScrollY: 900,
			 scrollY: 1200,
			 viewportHeight: 900,
			 documentHeight: 2100
		 })).toEqual({ sourceY: 300, destinationY: 1800, height: 300 });
	 });
});
