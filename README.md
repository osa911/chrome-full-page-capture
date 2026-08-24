# Full-page capture extension

Save the active webpage as a long PNG or an image-based PDF. The extension processes captures locally.

## Install the extension locally

1. Run `npm install`.
2. Run `npm run build`.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the `dist` directory.
7. Open a normal webpage and click the extension.
8. Choose **Download PNG** or **Download PDF**.

Chrome blocks extension access to restricted pages, including `chrome://` URLs. Capture a normal webpage instead.

The capture preserves Chrome's rendered pixels. Fixed headers, floating buttons, and other fixed elements can repeat in a long capture by design.

## Run automated checks

Run the complete automated suite before loading the extension:

```sh
npm test
npm run build
```

## Check the extension in Chrome

After you load `dist`, open [the local long-page fixture](test/fixtures/long-page.html). If you open the fixture as a `file://` URL, open the extension's **Details** page and enable **Allow access to file URLs** first.

Scroll the fixture to a nonzero position and note the `window.scrollY` readout. Capture it once as PNG and once as PDF. Confirm that the PNG matches the page width and height, the PDF has the expected number of A4 pages, the canvas and embedded images appear, fixed elements remain visible, and the readout returns to its original value after each capture.

Also check these pages:

- A short page.
- A page with a partial final viewport.
- A long article with images.
- A lazy-loaded page.
- A page with a canvas chart.
- A page with a nested scroll container.
- A page with a fixed header.
- A restricted browser page.

On a restricted page, Chrome should block the capture. When any capture errors, confirm that the page returns to its original scroll position and that no partial file downloads.
