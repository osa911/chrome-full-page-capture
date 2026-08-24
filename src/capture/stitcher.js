import { computeFramePlacement } from './geometry.js';

function requirePositiveNumber(value, name) {
	 if (!Number.isFinite(value) || value <= 0) {
		 throw new RangeError(`${name} must be a positive number`);
	 }

	 return value;
}

function requireFrames(value) {
	 if (!Array.isArray(value)) {
		 throw new TypeError('frames must be an array');
	 }

	 return value;
}

export async function stitchFrames({
	 frames,
	 documentWidth,
	 documentHeight,
	 viewportHeight,
	 pixelRatio
}) {
	 const captureFrames = requireFrames(frames);
	 const width = requirePositiveNumber(Number(documentWidth), 'document width');
	 const height = requirePositiveNumber(Number(documentHeight), 'document height');
	 const viewport = requirePositiveNumber(Number(viewportHeight), 'viewport height');
	 const ratio = requirePositiveNumber(Number(pixelRatio), 'pixel ratio');

	 let canvas;
	 try {
		 canvas = new OffscreenCanvas(width * ratio, height * ratio);
	 } catch (error) {
		 throw new Error(`Unable to allocate capture canvas: ${error instanceof Error ? error.message : String(error)}`);
	 }

	 const context = canvas.getContext('2d');
	 if (!context) {
		 throw new Error('Unable to acquire capture canvas context');
	 }

	 let previousScrollY = 0;
	 for (const [index, frame] of captureFrames.entries()) {
		 const response = await fetch(frame.dataUrl);
		 const bitmap = await createImageBitmap(await response.blob());
		 try {
			 const placement = index === 0
				 ? { sourceY: 0, destinationY: 0, height: Math.min(viewport, height) }
				 : computeFramePlacement({
					 previousScrollY,
					 scrollY: frame.scrollY,
					 viewportHeight: viewport,
					 documentHeight: height
				 });

			 if (placement.height > 0) {
				 const sourceY = placement.sourceY * ratio;
				 const sourceHeight = placement.height * ratio;
				 context.drawImage(
					 bitmap,
					 0,
					 sourceY,
					 bitmap.width,
					 sourceHeight,
					 0,
					 placement.destinationY * ratio,
					 width * ratio,
					 sourceHeight
				 );
			 }
		 } finally {
			 bitmap.close();
		 }
		 previousScrollY = Number(frame.scrollY);
	 }

	 try {
		 return await canvas.convertToBlob({ type: 'image/png' });
	 } catch (error) {
		 throw new Error(`Unable to encode capture as PNG: ${error instanceof Error ? error.message : String(error)}`);
	 }
}
