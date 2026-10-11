import { useCallback, useEffect, useRef, useState } from "react";
import { useStudio } from "../../contexts/StudioContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useToast } from "../../utils/toast";
import { Icon } from "../ui/Icon";

/**
 * Empty-state hero. Uses the brand's atmospheric video plate with the
 * left-locked condensed typography and red CTA styling from the design brief.
 *
 * Four ways in, so a blocked picker is never a dead end:
 *   1. Browse (native file picker)
 *   2. Drag & drop anywhere in the window
 *   3. Paste an image from the clipboard (Ctrl/Cmd+V)
 *   4. Load from a URL
 */
export function DropZone() {
  const { addFiles, addFromUrl, isDragging } = useStudio();
  const { t } = useLanguage();
  const { error: showError } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * True while the native picker is open. Prevents a second `click()` (double
   * click, Enter key repeat, or the browser re-entering the handler) from
   * stacking two picker dialogs on top of each other.
   */
  const pickerOpenRef = useRef(false);
  const [hover, setHover] = useState(false);
  const [url, setUrl] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const resetPicker = useCallback(() => {
    pickerOpenRef.current = false;
    const input = inputRef.current;
    // Clear BEFORE opening the picker as well as after: a leftover value would
    // let a remembered file fire `change` again without the user choosing it.
    if (input) input.value = "";
  }, []);

  const openPicker = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    if (pickerOpenRef.current) return; // one dialog at a time
    pickerOpenRef.current = true;
    input.value = ""; // never inherit a previous selection
    try {
      input.click();
    } catch {
      // Some embeds/iframes refuse programmatic activation - say so instead of
      // failing silently.
      pickerOpenRef.current = false;
      showError("drop.pickerBlocked");
    }
  }, [showError]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    try {
      // Every import path (browse, drop, paste, URL) processes immediately, so
      // the flow is always "get an image in -> see the result".
      if (picked?.length) void addFiles(Array.from(picked), true);
    } finally {
      // Reset asynchronously: clearing the value synchronously inside the change
      // handler can re-arm the picker in some browsers.
      window.setTimeout(resetPicker, 0);
    }
  };

  /** Fired by Chrome/Firefox when the picker is dismissed without a choice. */
  const handleCancel = useCallback(() => {
    resetPicker();
  }, [resetPicker]);

  // The `cancel` event (picker dismissed) is not in React's types, so it is
  // wired directly on the element.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.addEventListener("cancel", handleCancel);
    return () => input.removeEventListener("cancel", handleCancel);
  }, [handleCancel]);

  // Safety net: if the dialog is closed by any other route (tab switch, ESC in
  // some embeds) the guard flag must not stay stuck.
  useEffect(() => {
    const release = () => {
      window.setTimeout(() => {
        if (pickerOpenRef.current) resetPicker();
      }, 500);
    };
    window.addEventListener("focus", release);
    return () => window.removeEventListener("focus", release);
  }, [resetPicker]);

  const handleUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setUrlBusy(true);
    try {
      await addFromUrl(trimmed);
      setUrl("");
    } catch {
      /* addFromUrl already surfaced a toast */
    } finally {
      setUrlBusy(false);
    }
  };

  return (
    <div className="relative h-full overflow-hidden bg-bg-primary">
      {/* base gradient plate - always visible, acts as the video fallback on
          mobile where autoplay is blocked, so the homepage never "loses its
          image" */}
      <div className="hero-bg absolute inset-0" />
      {/* atmospheric video - hidden entirely on mobile autoplay failure */}
      {!videoError && (
        <video
          className="hero-video pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60"
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          preload="metadata"
          poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%230a0b0c'/%3E%3C/svg%3E"
          aria-label="Abstract digital network atmosphere"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_132544_b6ef0174-ed95-45ad-9a2f-ccb8acfbdce8.mp4"
          onError={() => setVideoError(true)}
        />
      )}
      <div className="hero-scrim pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />

      {/* content */}
      <div className="relative flex h-full flex-col overflow-y-auto px-6 sm:px-10 lg:px-16">
        {/* `m-auto` (not justify-center) keeps the hero centred when it fits,
            but stays fully reachable when a short viewport makes it overflow:
            justify-center would push the top half out of reach. */}
        <div className="m-auto w-full py-2">
        <p className="hero-accent font-mono text-[11px] uppercase tracking-[0.34em] animate-rise-in">
          Dannz AI Studio
        </p>
        <h1 className="hero-title mt-3 max-w-xl font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-tight animate-line-in sm:text-4xl lg:text-5xl">
          Background removal
          <br />
          built into every layer
        </h1>
        <p className="hero-sub mt-4 max-w-md font-mono text-sm leading-relaxed animate-rise-in [animation-delay:120ms]">
          {t("drop.subtitle")}
        </p>

        <div
          className={`drop-zone mica mt-6 max-w-xl animate-rise-in [animation-delay:200ms] sm:mt-8 ${
            isDragging || hover ? "drop-zone-active" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setHover(true);
          }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHover(false);
            if (e.dataTransfer.files.length)
              void addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          {/*
            Rendered but visually hidden (NOT display:none - that would block
            programmatic activation).

            Deliberately has no `name` attribute and carries autoComplete="off":
            browsers that autofill file fields (Chrome remembers files uploaded
            to an origin) would otherwise re-fire `change` with a file from a
            previous session, loading an image the user never picked. Labelled
            with aria-label so the accessibility audit passes without a
            <label for>, which would open a second picker when clicked.
          */}
          <input
            ref={inputRef}
            id="image-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff"
            autoComplete="off"
            multiple
            className="file-input-offscreen"
            aria-label={t("drop.title")}
            onChange={handleChange}
          />
          <Icon
            name="download-cloud"
            size={30}
            className="mx-auto text-accent-primary"
          />
          <p className="mt-3 font-display text-lg font-bold uppercase tracking-wider text-text-primary">
            {t("drop.title")}
          </p>
          <p className="mt-1 font-mono text-xs text-text-muted">
            {t("drop.or")}
          </p>
          {/* Explicit button + programmatic click: predictable, single picker. */}
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={openPicker}
          >
            <Icon name="upload" size={15} />
            {t("drop.browse")}
          </button>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {t("drop.formats")} · {t("drop.pasteHint")}
          </p>

          {/* Load from URL */}
          <form
            onSubmit={handleUrl}
            className="mt-4 flex gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <label htmlFor="image-url" className="sr-only">
              {t("drop.urlLabel")}
            </label>
            <input
              id="image-url"
              name="image-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              className="input !py-1.5 font-mono text-xs"
              placeholder={t("drop.urlPlaceholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="submit"
              disabled={urlBusy || !url.trim()}
              className="btn-secondary shrink-0 !px-3 !py-1.5 text-xs"
            >
              <Icon name="download" size={13} />
              {urlBusy ? t("drop.urlLoading") : t("drop.urlLoad")}
            </button>
          </form>
        </div>
        </div>
      </div>
    </div>
  );
}
