import { useEffect, useRef, useState } from "react";
import { api, type Catalog } from "../api";

type Style = Catalog["templates"][number];

const stillPlease = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * A style's moving preview. For someone who asks their Mac to reduce motion, it shows the first
 * frame instead, since a GIF can't be paused.
 */
function Preview({
  src,
  width,
  height,
  lazy,
}: {
  src: string;
  width: number;
  height: number;
  lazy?: boolean;
}) {
  const [still, setStill] = useState<string | null>(null);
  if (still) return <img src={still} alt="" width={width} height={height} />;
  return (
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      {...(lazy ? { loading: "lazy" as const } : {})}
      onLoad={(event) => {
        if (!stillPlease()) return;
        const image = event.currentTarget;
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
        setStill(canvas.toDataURL("image/png"));
      }}
    />
  );
}

interface FieldProps {
  styles: Style[];
  /** The style in use, or null while a matched reel's style is on. */
  current: string | null;
  onOpen(): void;
}

/** The style in use, with its moving preview, opening the gallery. */
export function StyleField({ styles, current, onOpen }: FieldProps) {
  const style = styles.find((entry) => entry.manifest.id === current);
  return (
    <div className="style-field">
      <span className="style-field-label" id="style-label">
        Style
      </span>
      <button
        type="button"
        className="style-current"
        aria-haspopup="dialog"
        aria-labelledby="style-label style-name"
        onClick={onOpen}
      >
        {style ? <Preview src={style.preview} width={36} height={64} /> : null}
        <span id="style-name">{style?.manifest.name ?? "Your reel's style"}</span>
        <span className="style-change">Change</span>
      </button>
    </div>
  );
}

interface GalleryProps {
  styles: Style[];
  current: string | null;
  /** Only the person at this Mac can look online for new styles. */
  local: boolean;
  onPick(id: string): void;
  onClose(): void;
  /** Called after new styles arrive, so the catalog can load them. */
  onAdded(): void;
}

/** Every style that cuts photos to music, each playing its own preview. */
export function StyleGallery({ styles, current, local, onPick, onClose, onAdded }: GalleryProps) {
  const sheet = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<string | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    sheet.current?.showModal();
    heading.current?.focus();
    return () => opener?.focus();
  }, []);

  const lookForMore = async () => {
    setLooking(true);
    setFound(null);
    try {
      const { added, updated, skipped } = await api.updateTemplates();
      const fresh = [...added, ...updated];
      setFound(
        fresh.length > 0
          ? `Added ${fresh.join(", ")}.`
          : skipped.length > 0
            ? `Nothing new you can use. ${skipped.length} couldn't be added: ${skipped[0]?.reason}.`
            : "You have every style already.",
      );
      if (fresh.length > 0) onAdded();
    } catch (error) {
      setFound((error as Error).message);
    }
    setLooking(false);
  };

  return (
    <dialog
      ref={sheet}
      className="sheet gallery"
      aria-labelledby="gallery-heading"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="gallery-body">
        <header className="gallery-head">
          <h2 id="gallery-heading" ref={heading} tabIndex={-1}>
            Styles
          </h2>
          <button type="button" className="button-quiet" onClick={onClose}>
            Done
          </button>
        </header>
        <p className="gallery-lede">
          Each style paces your photos differently and sets how the words look. Your vibe still
          picks the music and colour.
        </p>
        <ul className="gallery-grid">
          {styles.map((style) => {
            const chosen = style.manifest.id === current;
            return (
              <li key={style.manifest.id}>
                <button
                  type="button"
                  className="gallery-card"
                  aria-pressed={chosen}
                  onClick={() => {
                    onPick(style.manifest.id);
                    onClose();
                  }}
                >
                  <Preview src={style.preview} width={216} height={384} lazy />
                  <span className="gallery-name">
                    {style.manifest.name}
                    {style.added ? <span className="gallery-tag">New</span> : null}
                  </span>
                  <span className="gallery-summary">{style.summary}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {local ? (
          <footer className="gallery-foot">
            <button
              type="button"
              className="button-outline"
              disabled={looking}
              onClick={() => void lookForMore()}
            >
              {looking ? "Looking on GitHub…" : "Get new styles"}
            </button>
            <p aria-live="polite">
              {found ??
                "Checks U-Cut's free library on GitHub. It only downloads; nothing about your reels is sent."}
            </p>
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
