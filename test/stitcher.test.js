import { stitchFrames } from '../src/capture/stitcher.js';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
	 vi.unstubAllGlobals();
});

it('rejects a non-positive document width', async () => {
	 await expect(stitchFrames({
		 frames: [],
		 documentWidth: 0,
		 documentHeight: 100,
		 viewportHeight: 100,
		 pixelRatio: 1
	 })).rejects.toThrow('document width');
});

it('rejects a canvas width above the browser limit before allocation', async () => {
	 const canvasConstructor = vi.fn();
	 vi.stubGlobal('OffscreenCanvas', canvasConstructor);

	 await expect(stitchFrames({
		 frames: [],
		 documentWidth: 32768,
		 documentHeight: 100,
		 viewportHeight: 100,
		 pixelRatio: 1
	 })).rejects.toThrow('canvas width');
	 expect(canvasConstructor).not.toHaveBeenCalled();
});

it('rounds fractional physical dimensions up before canvas allocation', async () => {
	 const allocatedDimensions = [];
	 vi.stubGlobal('OffscreenCanvas', class {
		 constructor(width, height) {
			 allocatedDimensions.push([width, height]);
		 }

		 getContext() {
			 return {};
		 }

		 convertToBlob() {
			 return Promise.resolve(new Blob());
		 }
	 });

	 await stitchFrames({
		 frames: [],
		 documentWidth: 10.1,
		 documentHeight: 20.1,
		 viewportHeight: 20,
		 pixelRatio: 1.5
	 });

	 expect(allocatedDimensions).toEqual([[16, 31]]);
});
