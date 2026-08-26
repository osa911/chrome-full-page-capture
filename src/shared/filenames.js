const FALLBACK_FILENAME_STEM = 'capture';
const MAX_FILENAME_STEM_LENGTH = 80;
const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F]/g;

export function sanitizeFilenameStem(value) {
	const candidate = typeof value === 'string' ? value : '';
	const sanitized = candidate
		.replace(INVALID_FILENAME_CHARACTERS, ' - ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_FILENAME_STEM_LENGTH)
		.replace(/^[. ]+|[. ]+$/g, '')
		.trim();

	return sanitized || FALLBACK_FILENAME_STEM;
}

export function createCaptureFilename(value, format, date = new Date()) {
	if (format !== 'png' && format !== 'pdf') {
		throw new Error('Capture format must be png or pdf.');
	}

	const timestamp = date.toISOString()
		.replace('T', '_')
		.replace(/:/g, '-')
		.replace(/\.\d{3}Z$/, (milliseconds) => `-${milliseconds.slice(1, -1)}`);

	return `${sanitizeFilenameStem(value)}_${timestamp}.${format}`;
}
