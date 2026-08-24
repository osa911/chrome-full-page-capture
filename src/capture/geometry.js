function requirePositiveNumber(value, name) {
	 if (!Number.isFinite(value) || value <= 0) {
		 throw new RangeError(`${name} must be a positive number`);
	 }

	 return value;
}

function clampDocumentHeight(value) {
	 const height = Number(value);
	 if (!Number.isFinite(height)) {
		 throw new RangeError('documentHeight must be finite');
	 }

	 return Math.max(0, height);
}

export function createCapturePositions({ documentHeight, viewportHeight }) {
	 const height = clampDocumentHeight(documentHeight);
	 const viewport = requirePositiveNumber(Number(viewportHeight), 'viewportHeight');

	 if (height <= viewport) {
		 return [0];
	 }

	 const positions = [];
	 for (let scrollY = 0; scrollY + viewport < height; scrollY += viewport) {
		 positions.push(scrollY);
	 }

	 const finalPosition = Math.max(0, height - viewport);
	 if (positions.at(-1) !== finalPosition) {
		 positions.push(finalPosition);
	 }

	 return positions;
}

export function computeFramePlacement({ previousScrollY, scrollY, viewportHeight, documentHeight }) {
	 const viewport = requirePositiveNumber(Number(viewportHeight), 'viewportHeight');
	 const height = clampDocumentHeight(documentHeight);
	 const previous = Math.max(0, Number(previousScrollY));
	 const current = Math.max(0, Number(scrollY));
	 const frameOffset = Math.max(0, current - previous);
	 const destinationY = previous + viewport;

	 return {
		 sourceY: Math.max(0, viewport - frameOffset),
		 destinationY,
		 height: Math.max(0, Math.min(frameOffset, height - destinationY))
	 };
}
