import { stitchFrames } from '../src/capture/stitcher.js';
import { expect, it } from 'vitest';

it('rejects a non-positive document width', async () => {
	 await expect(stitchFrames({
		 frames: [],
		 documentWidth: 0,
		 documentHeight: 100,
		 viewportHeight: 100,
		 pixelRatio: 1
	 })).rejects.toThrow('document width');
});
