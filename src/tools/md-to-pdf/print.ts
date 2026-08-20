/**
 * Prints a standalone HTML document through a hidden iframe.
 *
 * Kept in its own module so Tool.tsx can be tested without it: jsdom
 * implements neither window.print nor iframe document.write well enough to
 * exercise this, so the tests mock this seam rather than the DOM.
 */

/** Milliseconds to keep the iframe alive after print() returns. */
const CLEANUP_DELAY = 1000;

/**
 * Waits for every image in the document to settle. Printing before they
 * load produces blank boxes where the pictures should be, and print() does
 * not wait on its own.
 *
 * Resolves on error as well as load — a broken image should still let the
 * rest of the document print rather than hanging the button forever.
 */
function waitForImages(doc: Document): Promise<void> {
  const pending = Array.from(doc.images).filter((image) => !image.complete);
  if (pending.length === 0) return Promise.resolve();

  return Promise.all(
    pending.map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
}

export async function printDocument(html: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("title", "Print preview");
  // Off-screen rather than display:none — a display:none iframe does not
  // lay out, so it has nothing to paginate and prints blank.
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;";

  document.body.appendChild(frame);

  const cleanup = () => {
    window.setTimeout(() => frame.remove(), CLEANUP_DELAY);
  };

  try {
    const doc = frame.contentDocument;
    const view = frame.contentWindow;
    if (!doc || !view) {
      throw new Error("The print frame could not be opened.");
    }

    doc.open();
    doc.write(html);
    doc.close();

    await waitForImages(doc);

    // Removing the frame the instant print() returns cancels the job in
    // some browsers, so cleanup is deferred either way.
    view.addEventListener("afterprint", cleanup, { once: true });
    view.focus();
    view.print();
    cleanup();
  } catch (error) {
    frame.remove();
    throw error;
  }
}
