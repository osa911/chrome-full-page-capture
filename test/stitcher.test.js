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

it('uses adjacent raster boundaries for fractional DPR and an odd viewport height', async () => {
	const drawImage = vi.fn();
	vi.stubGlobal('OffscreenCanvas', class {
		getContext() {
			return { drawImage };
		}

		convertToBlob() {
			return Promise.resolve(new Blob());
		}
	});
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => new Blob() }));
	vi.stubGlobal('createImageBitmap', vi.fn()
		.mockResolvedValueOnce({ width: 1000, height: 877, close() {} })
		.mockResolvedValueOnce({ width: 1000, height: 877, close() {} })
		.mockResolvedValueOnce({ width: 1000, height: 877, close() {} }));

	await stitchFrames({
		frames: [
			{ dataUrl: 'data:image/png;base64,first', scrollY: 0 },
			{ dataUrl: 'data:image/png;base64,second', scrollY: 701 },
			{ dataUrl: 'data:image/png;base64,third', scrollY: 702 }
		],
		documentWidth: 800,
		documentHeight: 1403,
		viewportHeight: 701,
		pixelRatio: 1.25
	});

	expect(drawImage.mock.calls.map(([, , sourceY, , sourceHeight, , destinationY, , destinationHeight]) => ({
		sourceY,
		sourceHeight,
		destinationY,
		destinationHeight
	}))).toEqual([
		{ sourceY: 0, sourceHeight: 877, destinationY: 0, destinationHeight: 876 },
		{ sourceY: 0, sourceHeight: 877, destinationY: 876, destinationHeight: 877 },
		{ sourceY: 876, sourceHeight: 1, destinationY: 1753, destinationHeight: 1 }
	]);
});
