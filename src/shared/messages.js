export const MESSAGE_TYPES = Object.freeze({
	 START_CAPTURE: 'START_CAPTURE',
	 GET_METRICS: 'GET_METRICS',
	 SCROLL_TO: 'SCROLL_TO',
	 RESTORE_SCROLL: 'RESTORE_SCROLL',
	 CAPTURE_PROGRESS: 'CAPTURE_PROGRESS',
	 CAPTURE_COMPLETE: 'CAPTURE_COMPLETE',
	 CAPTURE_ERROR: 'CAPTURE_ERROR'
});

export function isCaptureRequest(value) {
	 if (value === null || typeof value !== 'object') {
		 return false;
	 }

	 const keys = Object.keys(value);
	 const hasRequiredKeys = keys.includes('type')
		 && keys.includes('format')
		 && value.type === MESSAGE_TYPES.START_CAPTURE
		 && (value.format === 'png' || value.format === 'pdf');
	return hasRequiredKeys
		 && (keys.length === 2
			|| (keys.length === 3 && keys.includes('filename') && typeof value.filename === 'string'));
}
