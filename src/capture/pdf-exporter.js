import { PDFDocument } from 'pdf-lib';

const DEFAULT_OPTIONS = Object.freeze({
	 pageWidth: 595.28,
	 pageHeight: 841.89,
	 margin: 36
});

function requirePositiveNumber(value, name) {
	 if (!Number.isFinite(value) || value <= 0) {
		 throw new RangeError(`${name} must be a positive number`);
	 }

	 return value;
}

function getPageOptions(options = {}) {
	 const pageWidth = requirePositiveNumber(
		 Number(options.pageWidth ?? DEFAULT_OPTIONS.pageWidth),
		 'pageWidth'
	 );
	 const pageHeight = requirePositiveNumber(
		 Number(options.pageHeight ?? DEFAULT_OPTIONS.pageHeight),
		 'pageHeight'
	 );
	 const margin = Number(options.margin ?? DEFAULT_OPTIONS.margin);

	 if (!Number.isFinite(margin) || margin < 0) {
		 throw new RangeError('margin must be a non-negative number');
	 }
	 if (margin * 2 >= pageWidth || margin * 2 >= pageHeight) {
		 throw new RangeError('margin must leave positive page content dimensions');
	 }

	 return {
		 pageWidth,
		 pageHeight,
		 margin,
		 contentWidth: pageWidth - margin * 2,
		 contentHeight: pageHeight - margin * 2
	 };
}

export async function createPdfFromPng(pngBlob, options) {
	 const page = getPageOptions(options);
	 const pdfDocument = await PDFDocument.create();
	 const image = await pdfDocument.embedPng(await pngBlob.arrayBuffer());
	 const imageHeight = image.height * (page.contentWidth / image.width);
	 const pageCount = Math.ceil(imageHeight / page.contentHeight);

	 for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
		 const pdfPage = pdfDocument.addPage([page.pageWidth, page.pageHeight]);
		 pdfPage.drawImage(image, {
			 x: page.margin,
			 y: page.pageHeight - page.margin - (pageIndex + 1) * page.contentHeight,
			 width: page.contentWidth,
			 height: imageHeight
		 });
	 }

	 return new Blob([await pdfDocument.save()], { type: 'application/pdf' });
}
