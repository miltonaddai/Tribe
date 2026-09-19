import { useEffect, useState } from "react";
import { canCopyImages, copyShot, downloadShot, openPostComposer } from "../lib/screenshot";

/**
 * What the post says. The link is in the text because X appends `url` after it.
 *
 * The parenthetical is a prompt for the composer, not part of the post: the
 * image is already on the clipboard by the time this opens, and nothing on the
 * X page says so. It asks to be deleted because otherwise the most likely
 * outcome is that it gets posted.
 */
const POST_TEXT =
  "Playing $Tribe https://jointribe.fun\n\n(Press Ctrl/Cmd + V to add your screenshot, then delete this line)";

/**
 * What to do with a screenshot once it exists.
 *
 * "Post on X" carries the image as far as a web page is allowed to: onto the
 * clipboard, with the composer opened on top of it, so the picture is one
 * paste away. An intent link cannot attach a file, and there is no upload to
 * point X at - nothing here leaves the player's machine.
 *
 * Both halves are fired inside the click handler rather than chained off an
 * await. Opening the window after one would read as an unrequested popup and
 * be blocked, and starting the clipboard write after the window opened would
 * fail the other way, because writing needs the document focused.
 */
export function ShotPreview({ blob, onClose }: { blob: Blob; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);

  useEffect(() => {
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);

  function postOnX() {
    const copying = canCopyImages() ? copyShot(blob) : Promise.resolve(false);
    openPostComposer(POST_TEXT);
    void copying.then((ok) => {
      setCopied(ok);
      // No clipboard: hand them the file instead, so there is still something
      // to attach rather than a composer and no picture.
      if (!ok) downloadShot(blob);
    });
  }

  return (
    <div className="shot-modal">
      <header className="shot-head">
        <h3>Screenshot</h3>
        <button className="btn btn-ghost shot-x" type="button" onClick={onClose}>
          Close
        </button>
      </header>

      {url && <img className="shot-img" src={url} alt="Your screenshot" />}

      <div className="shot-actions">
        <button className="btn btn-accent" type="button" onClick={postOnX}>
          Post on X
        </button>
        <button className="btn" type="button" onClick={() => downloadShot(blob)}>
          Save
        </button>
      </div>

      <p className="shot-note">
        {copied === null
          ? "Opens X with the image copied — press Ctrl+V in the post to attach it."
          : copied
            ? "Image copied — press Ctrl+V in the post to attach it."
            : "Clipboard unavailable, so the image was saved instead — attach it to the post."}
      </p>
    </div>
  );
}
