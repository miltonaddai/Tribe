/**
 * Screenshots, composed and shared entirely on the player's own machine.
 *
 * Nothing is uploaded. The image is made in a canvas, handed to the browser,
 * and that is the end of it - so there is no bucket to pay for, no moderation
 * surface, and nothing to explain in a privacy notice.
 *
 * Sharing to X is shaped by one hard limitation: X's web intent accepts text
 * and a URL, and has no way to accept an image. So the flow cannot be "post
 * this picture"; it has to be "put the picture where X can reach it, then open
 * a composed post". Copying to the clipboard turns out to be the least annoying
 * version of that - paste into the composer and it attaches - with a download
 * as the fallback for browsers that will not write images to the clipboard.
 */

/** Bottom-right mark. Small enough not to spoil the shot, enough to be read. */
const MARK = "TRIBE";

/**
 * Copies a live canvas into an offscreen one.
 *
 * MUST be called in the same frame the canvas was drawn. A WebGL drawing buffer
 * is discarded once the browser composites it, so a copy taken any later comes
 * back transparent - the classic "my screenshot is blank" bug. The usual fix is
 * preserveDrawingBuffer, but that is a device-creation flag every player would
 * then pay for on every frame, forever, to support a button most never press.
 */
export function snapshot(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const off = document.createElement("canvas");
  off.width = source.width;
  off.height = source.height;
  const ctx = off.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0);
  return off;
}

/**
 * Adds the watermark and encodes. Safe to run after the frame has passed, since
 * it works on the copy rather than on the live buffer.
 */
export async function composeShot(shot: HTMLCanvasElement, caption: string): Promise<Blob | null> {
  const ctx = shot.getContext("2d");
  if (!ctx) return null;

  // Scale the mark to the image so it looks the same on any display.
  const unit = Math.max(14, Math.round(shot.height * 0.022));
  const pad = Math.round(unit * 1.1);
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";

  // A soft shade behind the text: over a bright sky white text alone vanishes.
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = unit * 0.7;
  ctx.shadowOffsetY = 1;

  ctx.font = `700 ${unit}px "Science Gothic Variable", system-ui, sans-serif`;
  ctx.fillStyle = "#E8B34A";
  ctx.fillText(MARK, shot.width - pad, shot.height - pad);

  if (caption) {
    ctx.font = `500 ${Math.round(unit * 0.62)}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
    ctx.fillText(caption, shot.width - pad, shot.height - pad - unit * 1.15);
  }
  ctx.restore();

  return new Promise((resolve) => shot.toBlob((b) => resolve(b), "image/png"));
}

export function shotFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `tribe-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}

export function downloadShot(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = shotFilename();
  a.click();
  // Revoked on a timer rather than immediately: Safari has not finished with
  // the URL when click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** True when this browser will put an image on the clipboard. */
export function canCopyImages(): boolean {
  return typeof ClipboardItem !== "undefined" && Boolean(navigator.clipboard?.write);
}

export async function copyShot(blob: Blob): Promise<boolean> {
  if (!canCopyImages()) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    // Denied, or not in a user gesture. The caller offers the download instead.
    return false;
  }
}

/** True when the native share sheet will take a file - mobile, mostly. */
export function canShareFiles(blob: Blob): boolean {
  const file = new File([blob], shotFilename(), { type: "image/png" });
  return Boolean(navigator.canShare?.({ files: [file] }));
}

/**
 * The native share sheet, which on a phone posts to X with the image attached -
 * the one route that does not need the player to paste anything.
 */
export async function shareShot(blob: Blob, text: string): Promise<boolean> {
  try {
    const file = new File([blob], shotFilename(), { type: "image/png" });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ files: [file], text });
    return true;
  } catch {
    // Cancelling the sheet throws; that is not a failure worth reporting.
    return false;
  }
}

/** Opens X's composer with the text filled in. The image is attached by hand. */
export function openPostComposer(text: string) {
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("text", text);
  url.searchParams.set("url", window.location.origin);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}
