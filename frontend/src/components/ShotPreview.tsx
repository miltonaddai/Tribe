import { useEffect, useState } from "react";
import {
  canCopyImages,
  canShareFiles,
  copyShot,
  downloadShot,
  openPostComposer,
  shareShot,
} from "../lib/screenshot";

/**
 * What to do with a screenshot once it exists.
 *
 * The button order is the honest order of convenience, which is not the obvious
 * one. X cannot be handed an image by a link, so "Post on X" alone would drop
 * the player into an empty composer with their picture still on this machine.
 * Copying first and posting second is two clicks but actually works: paste into
 * the composer and the image attaches.
 *
 * Where the native share sheet takes files - phones, mostly - it is offered
 * first, because that is the one route that posts the image directly.
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
  const [copied, setCopied] = useState(false);
  const native = canShareFiles(blob);

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
        {native ? (
          <button
            className="btn btn-accent"
            type="button"
            onClick={() => void shareShot(blob, text)}
          >
            Share
          </button>
        ) : (
          <button
            className="btn btn-accent"
            type="button"
            disabled={!canCopyImages()}
            onClick={() => {
              void copyShot(blob).then((ok) => {
                setCopied(ok);
                if (!ok) downloadShot(blob);
              });
            }}
          >
            {copied ? "Copied ✓" : "Copy image"}
          </button>
        )}
        <button className="btn btn-outline" type="button" onClick={() => openPostComposer(text)}>
          Post on X
        </button>
        <button className="btn" type="button" onClick={() => downloadShot(blob)}>
          Save
        </button>
      </div>

      <p className="shot-note">
        {native
          ? "Share attaches the image directly."
          : copied
            ? "Image copied — open X and paste it into the post."
            : "X cannot accept an image from a link, so copy it first and paste it into the post."}
      </p>
    </div>
  );
}
