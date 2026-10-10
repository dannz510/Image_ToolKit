import { useRef, useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';

/**
 * Empty-state hero. Uses the brand's atmospheric video plate with the
 * left-locked condensed typography and red CTA styling from the design brief.
 */
export function DropZone() {
  const { addFiles, isDragging } = useStudio();
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  return (
    <div className="relative h-full overflow-hidden bg-bg-primary">
      {/* atmospheric video */}
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60"
        style={{ objectPosition: 'center top' }}
        autoPlay
        muted
        loop
        playsInline
        disablePictureInPicture
        aria-label="Abstract digital network atmosphere"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_132544_b6ef0174-ed95-45ad-9a2f-ccb8acfbdce8.mp4"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(100deg, rgba(0,0,0,.92) 0%, rgba(0,0,0,.78) 45%, rgba(0,0,0,.35) 100%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />

      {/* content */}
      <div className="relative flex h-full flex-col justify-center px-6 sm:px-10 lg:px-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-accent-light animate-rise-in">
          Dannz AI Studio
        </p>
        <h1 className="mt-3 max-w-xl font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-text-primary animate-line-in sm:text-5xl lg:text-6xl">
          Background removal
          <br />
          built into every layer
        </h1>
        <p className="mt-4 max-w-md font-mono text-sm leading-relaxed text-text-secondary animate-rise-in [animation-delay:120ms]">
          {t('drop.subtitle')}
        </p>

        <div
          className={`drop-zone mt-8 max-w-xl animate-rise-in [animation-delay:200ms] ${
            isDragging || hover ? 'drop-zone-active' : ''
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setHover(true);
          }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHover(false);
            if (e.dataTransfer.files.length) void addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
          <Icon name="download-cloud" size={30} className="mx-auto text-accent-primary" />
          <p className="mt-3 font-display text-lg font-bold uppercase tracking-wider text-text-primary">
            {t('drop.title')}
          </p>
          <p className="mt-1 font-mono text-xs text-text-muted">{t('drop.or')}</p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" size={15} />
            {t('drop.browse')}
          </button>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {t('drop.formats')}
          </p>
        </div>
      </div>
    </div>
  );
}
