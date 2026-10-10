import type { CSSProperties } from 'react';

/**
 * Renders one of the bundled SVG icons (src/assets/icons/*.svg) as an <img>.
 * Keeping icons as files means the brand mark stays crisp at any size and
 * participates in the service worker cache.
 */

const modules = import.meta.glob('../assets/icons/*.svg', {
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

export function Icon({ name, size, className = '', title }: IconProps) {
  const src = registry[name];
  if (!src) return null;
  const style: CSSProperties | undefined = size ? { width: size, height: size } : undefined;
  return (
    <img
      src={src}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
      className={`shrink-0 select-none ${className}`}
      style={style}
    />
  );
}

export function hasIcon(name: string): boolean {
  return name in registry;
}
