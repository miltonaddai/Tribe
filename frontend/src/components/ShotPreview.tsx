import { useEffect, useState } from "react";
import { downloadShot, openPostComposer } from "../lib/screenshot";

/**
 * What to do with a screenshot once it exists.
 *
 * Two routes, and the note below them is load-bearing: X cannot be handed an
 * image by a link, so "Post on X" opens a composer with the caption in it and
 * nothing else. The picture has to be saved and attached by hand.
 */
export function ShotPreview({
  blob,
  caption,
  onClose,
}: {
  blob: Blob;
  caption: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);

  const text = `${caption} — playing Tribe`;

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
        <button className="btn btn-accent" type="button" onClick={() => openPostComposer(text)}>
          Post on X
        </button>
        <button className="btn" type="button" onClick={() => downloadShot(blob)}>
          Save
        </button>
      </div>

      <p className="shot-note">Save the image first — X cannot attach it from a link.</p>
    </div>
  );
}
