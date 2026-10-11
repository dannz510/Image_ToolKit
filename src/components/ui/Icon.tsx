import type { CSSProperties } from 'react';

/**
 * Renders one of the bundled SVG icons (src/assets/icons/*.svg).
 *
 * The icons are drawn with `stroke="currentColor"`, so they are applied as a
 * CSS mask rather than an <img>: an externally-loaded SVG image cannot inherit
 * `currentColor` from the page, which is why the icons used to render black in
 * every theme. Masking them makes them take the surrounding text colour, so
 * they follow the dark/light tokens automatically.
 */

const modules = import.meta.glob('../../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const registry: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const name = path.split('/').pop()?.replace('.svg', '') ?? '';
  registry[name] = url;
}

export const ICON_NAMES = Object.keys(registry);

export interface IconProps {
  name: keyof typeof registry | string;
  size?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 16, className = '', title }: IconProps) {
  const src = registry[name];
  if (!src) return null;

  const style: CSSProperties = {
    display: 'inline-block',
    width: size,
    height: size,
    flexShrink: 0,
    // The mask paints the icon in the inherited text colour.
    backgroundColor: 'currentColor',
    maskImage: `url("${src}")`,
    WebkitMaskImage: `url("${src}")`,
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
  };

  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`inline-block shrink-0 select-none ${className}`}
      style={style}
    />
  );
}

export function hasIcon(name: string): boolean {
  return name in registry;
}
