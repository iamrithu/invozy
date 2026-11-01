'use client';

import { useEffect, useState } from 'react';

/** Longest we hold the PDF for a slow logo/signature image or web font —
 * well inside renderPrintPage's own 20s budget, so a stuck image prints
 * without it instead of failing the whole download. */
const MAX_WAIT_MS = 8_000;

/** The signal src/lib/invoice-pdf.ts renderPrintPage waits for before
 * printing: an element with `data-pdf-ready="true"`, set once the page's
 * web fonts and every image (logo, signature) have loaded or failed — so
 * the PDF never captures a fallback font or a half-loaded logo. */
export function PdfReadyMarker() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setReady(true);
      }
    };
    const images = Array.from(document.images).map((img) =>
      img.complete
        ? null
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          })
    );
    const timer = setTimeout(finish, MAX_WAIT_MS);
    Promise.all([document.fonts?.ready, ...images]).then(finish, finish);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, []);

  return <div hidden data-pdf-ready={ready ? 'true' : 'false'} />;
}
