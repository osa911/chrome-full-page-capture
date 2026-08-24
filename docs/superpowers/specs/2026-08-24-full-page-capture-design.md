# Full-page capture extension design

## Goal

Build a private Chrome or Chromium extension for personal use. The extension captures the active webpage as Chrome displays it and downloads either a long PNG or a PDF.

The extension does not upload page content, require an account, or change the page's content. It restores the user's original scroll position after capture.

## User flow

1. The user opens the extension popup.
2. The popup shows **Download PNG** and **Download PDF**.
3. The user chooses one format before capture starts.
4. The extension captures the active tab from top to bottom.
5. The extension restores the original scroll position.
6. The extension downloads the selected file.

The first version does not hide sticky headers, floating buttons, or other fixed elements. Those elements can appear more than once because the capture preserves the rendered page.

## Recommended architecture

Use a Manifest V3 extension with four focused parts:

- `popup`: displays the two download actions and capture status.
- `service-worker`: coordinates the capture and owns the privileged Chrome API calls.
- `content-script`: reads page dimensions, scrolls the page, waits for rendering, and restores the original position.
- `capture`: decodes viewport images, removes overlap, stitches the PNG, and creates the PDF.

Use `activeTab` for temporary access to the page after the user invokes the extension. Use `scripting` to run the content script and `tabs.captureVisibleTab` to capture the visible viewport. Use `downloads` to save the completed file.

Keep all processing in the extension. Do not add a server, analytics, remote scripts, or remote fonts.

## Capture flow

The service worker coordinates the following sequence:

1. Query the active tab.
2. Ask the content script for the viewport width, viewport height, document width, document height, device pixel ratio, and current scroll position.
3. Build capture positions from the document height and viewport height.
4. Scroll to each position through the content script.
5. Wait for the scroll position and visible content to settle.
6. Call `tabs.captureVisibleTab` for the active tab.
7. Record the actual scroll position returned by the content script.
8. Restore the original scroll position in a `finally` path.
9. Stitch the captured images into one canvas at the capture pixel ratio.
10. Download a PNG or pass the stitched image to the PDF exporter.

Capture positions must use the actual scroll position returned by the page. The final position must be `documentHeight - viewportHeight` so the bottom of the page is included without leaving a blank area.

Chrome limits `tabs.captureVisibleTab` to two calls per second. The coordinator must rate-limit capture calls and show progress while a long page is being captured.

## Image stitching

The stitcher must:

- Decode each viewport image.
- Map CSS scroll coordinates to screenshot pixels.
- Draw each image at its actual document offset.
- Avoid adding a second copy of the overlap between adjacent captures.
- Crop the final canvas to the document width and document height.
- Reject dimensions that exceed the browser canvas limit instead of producing a corrupt file.

The stitcher must not alter page pixels to remove fixed elements. Repeated fixed elements are an accepted result in the first version.

## PDF export

Create an image-based PDF from the stitched PNG. Use A4 portrait pages by default, preserve the PNG aspect ratio, and split the image vertically across pages. The first version does not promise selectable text or clickable links.

The PDF exporter must avoid loading page content or third-party resources. It receives only the completed PNG data from the stitcher.

## Popup states

The popup needs these states:

- `idle`: show the two download buttons.
- `capturing`: disable both buttons and show capture progress.
- `exporting`: show that the selected file is being created.
- `complete`: show a short success message and allow another capture.
- `error`: show a useful error and allow another attempt.

The popup must explain when Chrome blocks capture, such as on a restricted browser page. It must not leave the page scrolled if capture fails.

## Error handling

Handle these cases explicitly:

- No active tab is available.
- The active tab is a restricted `chrome://` page or another page that rejects script access.
- The page navigates or closes during capture.
- The capture API returns an error or an empty image.
- The page height or final canvas exceeds browser limits.
- The PDF exporter cannot allocate a page or image.

Every capture attempt must restore the original scroll position when the content script remains available. The service worker must report a failed capture instead of downloading a partial file.

## Testing

Test the capture logic without Chrome by using synthetic viewport images and known scroll positions. Cover:

- A page shorter than one viewport.
- A page exactly one viewport tall.
- A page with a partial final viewport.
- A page whose height is not divisible by the viewport height.
- Device pixel ratios above one.
- Sticky and fixed elements that repeat.
- A failed capture during the middle of the sequence.
- Restoration of the original scroll position.
- PNG output dimensions and pixel placement.
- PDF page count and image placement.

Run manual browser checks against pages with long text, images, lazy-loaded content, a canvas chart, a nested scroll container, and a fixed header. Compare the result with Chrome's visible rendering and confirm that no network request leaves the extension.

## Scope exclusions

The first version does not include:

- Region or element capture.
- Annotation or cropping.
- Automatic removal of fixed elements.
- OCR or selectable PDF text.
- Cloud storage or sharing.
- Firefox or Safari support.
- Batch URL capture.

These features can be added later without changing the basic capture coordinator interface.

## Decision

Use viewport capture plus stitching for the extension. A DOM renderer is less faithful to the actual page. A DevTools Protocol utility is better for automation and headless workflows, but it adds a separate runtime and does not fit the requested one-click personal extension.
