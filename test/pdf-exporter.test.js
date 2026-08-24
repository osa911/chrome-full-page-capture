import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { createPdfFromPng } from '../src/capture/pdf-exporter.js';

function createPngBlob(width, height) {
	 const png = new PNG({ width, height });
	 return new Blob([PNG.sync.write(png)], { type: 'image/png' });
}

describe('PDF export', () => {
	 it('exports a PDF blob with one page for a short image', async () => {
		 const output = await createPdfFromPng(createPngBlob(1, 1));
		 const document = await PDFDocument.load(await output.arrayBuffer());

		 expect(output).toBeInstanceOf(Blob);
		 expect(output.type).toBe('application/pdf');
		 expect(document.getPageCount()).toBe(1);
	 });

	 it('creates multiple pages for a tall image', async () => {
		 const output = await createPdfFromPng(createPngBlob(100, 2000));
		 const document = await PDFDocument.load(await output.arrayBuffer());

		 expect(document.getPageCount()).toBeGreaterThan(1);
	 });
});
