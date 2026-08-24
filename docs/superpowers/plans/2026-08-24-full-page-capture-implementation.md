# Full-page capture extension implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private Chrome or Chromium Manifest V3 extension that captures the active webpage as a long PNG or an image-based PDF.

**Architecture:** A popup sends the selected format to a service worker. The service worker injects a content script, scrolls the active tab through measured positions, captures each viewport with `chrome.tabs.captureVisibleTab`, and stitches the images locally. The PNG stitcher and PDF exporter remain separate pure-ish modules so their geometry can be tested without a browser.

**Tech Stack:** Plain JavaScript modules, Manifest V3, Chrome Extensions APIs, `esbuild`, `vitest`, `pdf-lib`, `OffscreenCanvas`, and `ImageBitmap`.

**Spec:** `docs/superpowers/specs/2026-08-24-full-page-capture-design.md`

## Global constraints

- Target Chrome and Chromium only.
- Keep all processing in the extension.
- Do not add a server, analytics, remote scripts, or remote fonts.
- Preserve the rendered page, including sticky and fixed elements.
- Restore the original scroll position after every capture attempt when the content script remains available.
- Offer **Download PNG** and **Download PDF** before capture starts.
- Create an image-based PDF with A4 portrait pages.
- Reject dimensions that exceed browser canvas limits.
- Do not download a partial file after a failed capture.

## File map

Create these files during implementation:

- `package.json`: scripts and local build dependencies.
- `src/manifest.json`: Manifest V3 metadata, permissions, and entry points.
- `src/popup.html`, `src/popup.css`, `src/popup.js`: the format picker and status UI.
- `src/service-worker.js`: capture coordinator, Chrome API calls, downloads, and progress messages.
- `src/content-script.js`: page metrics, scrolling, render settling, and scroll restoration.
- `src/shared/messages.js`: message names and runtime payload validation.
- `src/capture/geometry.js`: capture positions and frame placement math.
- `src/capture/stitcher.js`: viewport image decoding and PNG stitching.
- `src/capture/pdf-exporter.js`: image-based PDF generation.
- `test/geometry.test.js`: capture position and placement tests.
- `test/stitcher.test.js`: stitcher input validation tests.
- `test/pdf-exporter.test.js`: PDF page layout tests.
- `test/messages.test.js`: message validation tests.
- `test/fixtures/long-page.html`: manual test page with long content and fixed UI.
- `scripts/build.mjs`: bundles JavaScript and copies static extension files to `dist/`.
- `README.md`: local installation and test instructions.

### Task 1: Create the project and test harness

**Files:**
- Create: `package.json`
- Create: `scripts/build.mjs`
- Create: `src/manifest.json`
- Create: `src/popup.html`
- Create: `src/popup.css`
- Create: `test/geometry.test.js`

**Interfaces:**
- Produces `npm test` for unit tests and `npm run build` for the unpacked extension.
- Produces `dist/manifest.json`, `dist/popup.html`, and `dist/popup.css` after a successful build.

- [ ] **Step 1: Write the failing project smoke test**

Create `test/geometry.test.js` with this import so the test runner fails before the module exists:

```js
import { createCapturePositions } from '../src/capture/geometry.js';
import { describe, expect, it } from 'vitest';

describe('capture geometry', () => {
	 it('exports the capture position function', () => {
		 expect(createCapturePositions).toBeTypeOf('function');
	 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/geometry.test.js`

Expected: FAIL because `package.json` and `src/capture/geometry.js` do not exist.

- [ ] **Step 3: Add the package and build configuration**

Create `package.json` with these scripts and dependencies:

```json
{
  "name": "full-page-capture-extension",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "vitest run"
  },
  "dependencies": {
    "pdf-lib": "^1.17.1"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "pngjs": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

Create `src/manifest.json` with `activeTab`, `scripting`, and `downloads` permissions, a popup action, and the service worker entry point:

```json
{
  "manifest_version": 3,
  "name": "Personal full-page capture",
  "version": "0.1.0",
  "description": "Save the active webpage as a long PNG or PDF.",
  "permissions": ["activeTab", "scripting", "downloads"],
  "background": { "service_worker": "service-worker.js" },
  "action": {
    "default_title": "Capture full page",
    "default_popup": "popup.html"
  }
}
```

Create `scripts/build.mjs` to bundle the three JavaScript entry points and copy the manifest and popup assets:

```js
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('src/manifest.json', 'dist/manifest.json');
await cp('src/popup.html', 'dist/popup.html');
await cp('src/popup.css', 'dist/popup.css');

await build({
	entryPoints: {
		'popup': 'src/popup.js',
		'service-worker': 'src/service-worker.js',
		'content-script': 'src/content-script.js'
	},
	bundle: true,
	format: 'iife',
	outdir: 'dist',
	platform: 'browser',
	logLevel: 'info'
});
```

Create a minimal `src/popup.html` that loads `popup.css` and `popup.js`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Full-page capture</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <main>
    <h1>Full-page capture</h1>
    <button id="png" type="button">Download PNG</button>
    <button id="pdf" type="button">Download PDF</button>
    <p id="status" role="status"></p>
  </main>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 4: Run the test to verify the harness works**

Run: `npm install && npm test -- test/geometry.test.js`

Expected: the test runner starts and fails only because `src/capture/geometry.js` is not implemented.

- [ ] **Step 5: Commit the project scaffold**

Run:

```bash
git add package.json package-lock.json scripts/build.mjs src/manifest.json src/popup.html src/popup.css test/geometry.test.js
git commit -m "chore: scaffold capture extension"
```

### Task 2: Implement capture geometry and message contracts

**Files:**
- Create: `src/capture/geometry.js`
- Create: `src/shared/messages.js`
- Modify: `test/geometry.test.js`
- Create: `test/messages.test.js`

**Interfaces:**
- `createCapturePositions({ documentHeight, viewportHeight })` returns an ascending array of CSS `scrollY` positions that includes `0` and the final position `documentHeight - viewportHeight`.
- `computeFramePlacement({ previousScrollY, scrollY, viewportHeight, documentHeight })` returns `{ sourceY, destinationY, height }` in CSS pixels.
- `MESSAGE_TYPES` exports `START_CAPTURE`, `GET_METRICS`, `SCROLL_TO`, `RESTORE_SCROLL`, `CAPTURE_PROGRESS`, `CAPTURE_COMPLETE`, and `CAPTURE_ERROR`.
- `isCaptureRequest(value)` accepts only `{ type: START_CAPTURE, format: 'png' | 'pdf' }`.

- [ ] **Step 1: Write failing geometry tests**

Add these cases to `test/geometry.test.js`:

```js
it('captures a page shorter than the viewport once', () => {
	 expect(createCapturePositions({ documentHeight: 600, viewportHeight: 900 })).toEqual([0]);
});

it('includes the final aligned position for a partial viewport', () => {
	 expect(createCapturePositions({ documentHeight: 2100, viewportHeight: 900 })).toEqual([0, 900, 1200]);
});

it('crops the overlap from the final frame', () => {
	 expect(computeFramePlacement({
		 previousScrollY: 900,
		 scrollY: 1200,
		 viewportHeight: 900,
		 documentHeight: 2100
	 })).toEqual({ sourceY: 300, destinationY: 1800, height: 300 });
});
```

- [ ] **Step 2: Run the geometry tests to verify they fail**

Run: `npm test -- test/geometry.test.js`

Expected: FAIL because the exported functions do not exist.

- [ ] **Step 3: Implement the geometry functions**

Implement `createCapturePositions` by clamping the document height to zero, returning `[0]` for a one-viewport page, and appending `Math.max(0, documentHeight - viewportHeight)` after each full viewport position. Implement `computeFramePlacement` by cropping the amount that the current frame overlaps the previous frame and limiting the final frame to the document bottom.

- [ ] **Step 4: Write failing message validation tests**

Create `test/messages.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { isCaptureRequest, MESSAGE_TYPES } from '../src/shared/messages.js';

describe('capture messages', () => {
	 it('accepts a PNG request', () => {
		 expect(isCaptureRequest({ type: MESSAGE_TYPES.START_CAPTURE, format: 'png' })).toBe(true);
	 });

	 it('rejects unknown formats and unrelated messages', () => {
		 expect(isCaptureRequest({ type: MESSAGE_TYPES.START_CAPTURE, format: 'jpeg' })).toBe(false);
		 expect(isCaptureRequest({ type: 'unknown' })).toBe(false);
	 });
});
```

- [ ] **Step 5: Implement the message constants and validator**

Export the constants as frozen strings and validate both the exact message type and the two supported formats.

- [ ] **Step 6: Run the focused tests**

Run: `npm test -- test/geometry.test.js test/messages.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the geometry and message contracts**

Run:

```bash
git add src/capture/geometry.js src/shared/messages.js test/geometry.test.js test/messages.test.js
git commit -m "feat: add capture geometry and message contracts"
```

### Task 3: Implement PNG stitching

**Files:**
- Create: `src/capture/stitcher.js`
- Modify: `test/geometry.test.js`

**Interfaces:**
- `stitchFrames({ frames, documentWidth, documentHeight, viewportHeight, pixelRatio })` returns a PNG `Blob`.
- Each frame has `{ dataUrl, scrollY }`.
- `stitchFrames` uses `createImageBitmap`, `OffscreenCanvas`, and the placement result from `computeFramePlacement`.

- [ ] **Step 1: Add a test for invalid dimensions**

Create `test/stitcher.test.js` with this test:

```js
it('rejects a non-positive document width', async () => {
	 await expect(stitchFrames({
		 frames: [],
		 documentWidth: 0,
		 documentHeight: 100,
		 viewportHeight: 100,
		 pixelRatio: 1
	 })).rejects.toThrow('document width');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/stitcher.test.js`

Expected: FAIL because `stitchFrames` does not exist.

- [ ] **Step 3: Implement the stitcher**

Decode each data URL with `fetch(...).then(response => response.blob())` and `createImageBitmap`. Allocate an `OffscreenCanvas` using `documentWidth * pixelRatio` and `documentHeight * pixelRatio`. Draw each bitmap at its computed destination and crop source pixels for overlap. Throw a descriptive error when dimensions are invalid or canvas allocation fails. Convert the canvas to `image/png` with `convertToBlob`.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- test/stitcher.test.js test/geometry.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the PNG stitcher**

Run:

```bash
git add src/capture/stitcher.js test/stitcher.test.js
git commit -m "feat: stitch viewport captures into PNG"
```

### Task 4: Implement PDF export

**Files:**
- Create: `src/capture/pdf-exporter.js`
- Create: `test/pdf-exporter.test.js`

**Interfaces:**
- `createPdfFromPng(pngBlob, options)` returns a PDF `Blob`.
- `options` defaults to `{ pageWidth: 595.28, pageHeight: 841.89, margin: 36 }` points.

- [ ] **Step 1: Write failing PDF tests**

Create `test/pdf-exporter.test.js` with `pngjs` fixtures and assert that the output has one page for a short image and more than one page for a tall image:

```js
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { createPdfFromPng } from '../src/capture/pdf-exporter.js';

function createPngBlob(width, height) {
  const png = new PNG({ width, height });
  return new Blob([PNG.sync.write(png)], { type: 'image/png' });
}

describe('PDF export', () => {
	 it('exports a PDF blob', async () => {
		 const png = createPngBlob(1, 1);
		 const output = await createPdfFromPng(png);
		 const document = await PDFDocument.load(await output.arrayBuffer());
		 expect(document.getPageCount()).toBe(1);
	 });

	 it('creates multiple pages for a tall image', async () => {
		 const output = await createPdfFromPng(createPngBlob(100, 2000));
		 const document = await PDFDocument.load(await output.arrayBuffer());
		 expect(document.getPageCount()).toBeGreaterThan(1);
	 });
});
```

Generate test images with `pngjs` instead of fetching a remote image.

- [ ] **Step 2: Run the PDF test to verify it fails**

Run: `npm test -- test/pdf-exporter.test.js`

Expected: FAIL because `createPdfFromPng` does not exist.

- [ ] **Step 3: Implement A4 image pagination**

Use `pdf-lib` to load the PNG, fit it to the page content width, create `Math.ceil(imageHeight / contentHeight)` A4 portrait pages, and draw the same embedded image at a different negative vertical offset on each page. The page boundary clips the image to the page. Return the saved bytes as a `Blob` with type `application/pdf`.

- [ ] **Step 4: Assert the output MIME type**

Assert that the output MIME type is `application/pdf`.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- test/pdf-exporter.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the PDF exporter**

Run:

```bash
git add src/capture/pdf-exporter.js test/pdf-exporter.test.js
git commit -m "feat: export stitched images as PDF"
```

### Task 5: Add page control and capture coordination

**Files:**
- Create: `src/content-script.js`
- Create: `src/service-worker.js`
- Modify: `src/shared/messages.js`

**Interfaces:**
- Content-script message `GET_METRICS` returns `{ viewportWidth, viewportHeight, documentWidth, documentHeight, pixelRatio, scrollX, scrollY }`.
- Content-script message `SCROLL_TO` accepts `{ scrollY }` and returns the actual `{ scrollX, scrollY }` after two animation frames.
- Content-script message `RESTORE_SCROLL` accepts `{ scrollX, scrollY }` and returns `{ restored: true }`.
- Service-worker function `captureTab(tabId, format)` returns a downloaded file result or throws a user-facing error.

- [ ] **Step 1: Add message types for page control and progress**

Extend `MESSAGE_TYPES` with `GET_METRICS`, `SCROLL_TO`, `RESTORE_SCROLL`, `CAPTURE_PROGRESS`, `CAPTURE_COMPLETE`, and `CAPTURE_ERROR`. Keep capture requests limited to `png` and `pdf`.

- [ ] **Step 2: Implement the content script**

Read document dimensions from both `document.documentElement` and `document.body`, using the largest valid value. Read viewport dimensions from `window.innerWidth` and `window.innerHeight`. Scroll with `window.scrollTo({ top: scrollY, behavior: 'instant' })`, then wait for two `requestAnimationFrame` callbacks before returning the actual coordinates. Register one `chrome.runtime.onMessage` listener and always return a response for recognized messages.

- [ ] **Step 3: Implement the service-worker coordinator**

On `START_CAPTURE`, query the active tab, inject `content-script.js` with `chrome.scripting.executeScript`, and request metrics. Build positions with `createCapturePositions`. For each position, send `SCROLL_TO`, wait 500 milliseconds to respect the two-calls-per-second capture limit, call `chrome.tabs.captureVisibleTab`, and store `{ dataUrl, scrollY }`. Send `CAPTURE_PROGRESS` after each frame.

- [ ] **Step 4: Restore the scroll position in a `finally` block**

Wrap the full capture loop in `try/finally`. If the tab still exists, send `RESTORE_SCROLL` with the initial coordinates. If restoration fails because the tab closed, preserve the original capture error and report it to the popup.

- [ ] **Step 5: Stitch and download only after capture succeeds**

Call `stitchFrames` after the final frame arrives. For PNG, download the PNG blob. For PDF, call `createPdfFromPng` and download the PDF blob. Use `chrome.downloads.download({ url: URL.createObjectURL(blob), filename, saveAs: true })`. Revoke the object URL after the download starts.

- [ ] **Step 6: Run the unit suite**

Run: `npm test`

Expected: PASS for geometry, message validation, stitcher validation, and PDF export.

- [ ] **Step 7: Commit the runtime coordinator**

Run:

```bash
git add src/content-script.js src/service-worker.js src/shared/messages.js
git commit -m "feat: capture and restore the active tab"
```

### Task 6: Build the popup and local extension bundle

**Files:**
- Create: `src/popup.js`
- Modify: `src/popup.css`
- Modify: `scripts/build.mjs`

**Interfaces:**
- Popup click handlers send `{ type: START_CAPTURE, format: 'png' | 'pdf' }`.
- Popup listens for progress, complete, and error messages.

- [ ] **Step 1: Write the popup behavior around the existing DOM**

Bind `#png` and `#pdf` click events. Set the status text to `Preparing capture…`, disable both buttons, and send the selected format with `chrome.runtime.sendMessage`.

- [ ] **Step 2: Implement progress and error states**

Display `Captured {current} of {total} viewports` during capture, `Creating PDF…` during PDF export, and a short success or error message on completion. Re-enable both buttons after completion or failure.

- [ ] **Step 3: Add small, keyboard-accessible popup styles**

Set a fixed popup width, keep the buttons at least 44 pixels high, add visible `:focus-visible` styles, and make the error state readable without color alone.

- [ ] **Step 4: Build the extension**

Run: `npm run build`

Expected: `dist/` contains `manifest.json`, `popup.html`, `popup.css`, `popup.js`, `service-worker.js`, and `content-script.js`.

- [ ] **Step 5: Commit the popup and bundle**

Run:

```bash
git add src/popup.js src/popup.css scripts/build.mjs dist
git commit -m "feat: add capture format popup"
```

### Task 7: Add manual fixtures, documentation, and browser verification

**Files:**
- Create: `test/fixtures/long-page.html`
- Create: `README.md`

- [ ] **Step 1: Create the long-page fixture**

Include long text sections, images from local data URLs, a canvas chart, a fixed header, a fixed button, and a nested scroll container. Add a visible `window.scrollY` readout so manual checks can confirm restoration.

- [ ] **Step 2: Document local installation**

Write these steps in `README.md`:

```text
1. Run npm install.
2. Run npm run build.
3. Open chrome://extensions.
4. Enable Developer mode.
5. Click Load unpacked.
6. Select the dist directory.
7. Open a normal webpage and click the extension.
8. Choose Download PNG or Download PDF.
```

Document that Chrome may block restricted pages such as `chrome://` URLs and that fixed elements can repeat by design.

- [ ] **Step 3: Run the complete automated checks**

Run:

```bash
npm test
npm run build
```

Expected: all tests pass and the build exits with code zero.

- [ ] **Step 4: Run the browser checks**

Load `dist/` as an unpacked extension. Test the fixture and these page types:

- A short page.
- A page with a partial final viewport.
- A long article with images.
- A lazy-loaded page.
- A page with a canvas chart.
- A page with a nested scroll container.
- A page with a fixed header.
- A restricted browser page.

Confirm that the PNG dimensions match the page dimensions, the PDF has the expected number of A4 pages, fixed elements remain visible, the original scroll position returns, and no partial file downloads after an error.

- [ ] **Step 5: Commit the fixture and documentation**

Run:

```bash
git add test/fixtures/long-page.html README.md
git commit -m "docs: add local installation and capture checks"
```

## Plan self-review

- The goal, exact-display requirement, two output formats, local-only processing, permissions, scroll restoration, rate limit, canvas limits, failure cases, and scope exclusions from the spec are covered by Tasks 1 through 7.
- The plan contains no `TODO`, `TBD`, or deferred implementation step.
- The message names and function names are consistent across the file map and task interfaces.
- The plan does not add region capture, annotation, OCR, cloud storage, batch capture, or non-Chromium support.
