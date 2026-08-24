import { computeFramePlacement } from './geometry.js';

const MAX_CANVAS_DIMENSION = 32767;
const MAX_CANVAS_AREA = 268435456;

function requirePositiveNumber(value, name) {
	 if (!Number.isFinite(value) || value <= 0) {
		 throw new RangeError(`${name} must be a positive number`);
	 }

	 return value;
}

function getPhysicalDimensions({ width, height, ratio }) {
	 const physicalWidth = Math.ceil(width * ratio);
	 const physicalHeight = Math.ceil(height * ratio);

	 if (!Number.isFinite(physicalWidth) || !Number.isFinite(physicalHeight)
		 || physicalWidth <= 0 || physicalHeight <= 0) {
		 throw new RangeError('canvas dimensions must be finite positive integers');
	 }

	 if (physicalWidth > MAX_CANVAS_DIMENSION) {
		 throw new RangeError(`canvas width ${physicalWidth} exceeds maximum ${MAX_CANVAS_DIMENSION}`);
	 }

	 if (physicalHeight > MAX_CANVAS_DIMENSION) {
		 throw new RangeError(`canvas height ${physicalHeight} exceeds maximum ${MAX_CANVAS_DIMENSION}`);
	 }

	 const area = physicalWidth * physicalHeight;
	 if (area > MAX_CANVAS_AREA) {
		 throw new RangeError(`canvas area ${area} exceeds maximum ${MAX_CANVAS_AREA}`);
	 }

	 return { physicalWidth, physicalHeight };
}

function requireFrames(value) {
	 if (!Array.isArray(value)) {
		 throw new TypeError('frames must be an array');
	 }

	 return value;
}

function getRasterPlacement(placement, sourceScale, destinationScale) {
	const sourceStart = Math.round(placement.sourceY * sourceScale);
	const sourceEnd = Math.round((placement.sourceY + placement.height) * sourceScale);
	const destinationStart = Math.round(placement.destinationY * destinationScale);
	const destinationEnd = Math.round((placement.destinationY + placement.height) * destinationScale);

	return {
		sourceY: sourceStart,
		sourceHeight: sourceEnd - sourceStart,
		destinationY: destinationStart,
		destinationHeight: destinationEnd - destinationStart
	};
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
	 const { physicalWidth, physicalHeight } = getPhysicalDimensions({ width, height, ratio });

	 let canvas;
	 try {
		 canvas = new OffscreenCanvas(physicalWidth, physicalHeight);
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

			 const rasterPlacement = getRasterPlacement(
				 placement,
				 bitmap.height / viewport,
				 ratio
			 );

			 if (rasterPlacement.sourceHeight > 0 && rasterPlacement.destinationHeight > 0) {
				 context.drawImage(
					 bitmap,
					 0,
					 rasterPlacement.sourceY,
					 bitmap.width,
					 rasterPlacement.sourceHeight,
					 0,
					 rasterPlacement.destinationY,
					 physicalWidth,
					 rasterPlacement.destinationHeight
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
