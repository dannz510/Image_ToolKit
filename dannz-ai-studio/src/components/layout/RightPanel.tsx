import { useEffect, useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { AIPanel } from '../panels/AIPanel';
import { AdjustPanel } from '../panels/AdjustPanel';
import { RegionPanel } from '../panels/RegionPanel';
import { HistoryPanel, LayersPanel, PresetsPanel } from '../panels/SidePanels';
import { BrushPanel, CropPanel, ShapePanel, TextPanel } from '../panels/ToolPanels';
import { Icon } from '../ui/Icon';
import type { ToolMode } from '../../types';

const TABS = [
  { id: 'ai', labelKey: 'panel.ai', icon: 'brain' },
  { id: 'adjust', labelKey: 'panel.adjust', icon: 'palette' },
  { id: 'region', labelKey: 'panel.region', icon: 'brush' },
  { id: 'presets', labelKey: 'panel.presets', icon: 'star' },
  { id: 'layers', labelKey: 'panel.layers', icon: 'layers' },
  { id: 'history', labelKey: 'panel.history', icon: 'clock' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Panels that a workspace tool can claim. */
type ToolPanelId = 'brush' | 'crop' | 'shape' | 'text';

const TOOL_PANEL: Partial<Record<ToolMode, ToolPanelId>> = {
  brush: 'brush',
  crop: 'crop',
  shape: 'shape',
  text: 'text',
};

/**
 * The panel is tool-driven: when a workspace tool is active the panel shows
 * that tool's controls, and picking a tab takes over from there. That way every
 * tab has one clear meaning instead of all of them showing the same list.
 */
export function RightPanel() {
  const [tab, setTab] = useState<TabId | null>(null);
  const { t } = useLanguage();
  const { activeResult, tool, viewMode, files } = useStudio();
  /**
   * Small-screen sheet state. Below lg the panel sits under the main region,
   * and an open sheet would squeeze the workspace (on the homepage it used to
   * eat the whole viewport). It starts collapsed and auto-collapses whenever
   * there is no image loaded, so the hero is never covered.
   */
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    setSheetOpen(files.length > 0);
  }, [files.length]);

  // A workspace tool claims the panel; an explicit tab click wins afterwards.
  useEffect(() => {
    setTab(null);
  }, [tool, viewMode]);

  const toolPanel = viewMode === 'workspace' ? TOOL_PANEL[tool] : undefined;
  const activePanel = toolPanel ?? tab;

  const renderContent = () => {
    switch (activePanel) {
      case 'brush':
        return <BrushPanel />;
      case 'crop':
        return <CropPanel />;
      case 'shape':
        return <ShapePanel />;
      case 'text':
        return <TextPanel />;
      case 'adjust':
        return <AdjustPanel />;
      case 'region':
        return <RegionPanel />;
      case 'presets':
        return <PresetsPanel />;
      case 'layers':
        return <LayersPanel />;
      case 'history':
        return <HistoryPanel />;
      case 'ai':
      default:
        return <AIPanel />;
    }
  };

  // Label the strip entry that is active.
  const isActive = (id: string) =>
    activePanel === id ||
    (viewMode === 'workspace' &&
      ((id === 'brush' && tool === 'brush') ||
        (id === 'crop' && tool === 'crop') ||
        (id === 'shape' && tool === 'shape') ||
        (id === 'text' && tool === 'text')));

  return (
     <aside
       className={`relative z-20 flex min-h-0 flex-col border-t border-bg-border/40 bg-bg-secondary/45 backdrop-blur-md lg:h-full lg:w-[320px] lg:border-l lg:border-t-0 ${
         sheetOpen ? 'max-h-[46dvh]' : ''
       } lg:max-h-none`}
     >
      {/* tab strip */}
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-bg-border/40 bg-bg-secondary/30 px-1.5 py-1 backdrop-blur-sm">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setSheetOpen(true);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              isActive(item.id)
                ? 'bg-accent-primary/12 text-accent-primary'
                : 'text-text-muted hover:bg-bg-tertiary hover:text-text-primary'
            }`}
            aria-current={isActive(item.id)}
          >
            <Icon name={item.icon} size={13} />
            <span className="hidden xl:inline">{t(item.labelKey)}</span>
          </button>
        ))}
        {/* sheet toggle - only meaningful below lg, where the panel is a
            collapsible bottom sheet instead of a fixed rail */}
        <button
          type="button"
          onClick={() => setSheetOpen((open) => !open)}
          className="ml-0.5 shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary lg:hidden"
          aria-label={t('common.close')}
          aria-expanded={sheetOpen}
          title={sheetOpen ? 'Collapse panel' : 'Expand panel'}
        >
          <Icon
            name="chevron-right"
            size={14}
            className={`transition-transform duration-200 ${sheetOpen ? '-rotate-90' : 'rotate-90'}`}
          />
        </button>
      </div>

      {/* active tool name, so the current controls are never ambiguous */}
      {viewMode === 'workspace' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-bg-border/40 bg-bg-secondary/30 px-3 py-1.5 backdrop-blur-sm">
          <Icon name={toolIcon(tool)} size={13} className="text-accent-primary" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary">
            {t(`tool.${tool}`)}
          </span>
        </div>
      )}

      {/* content */}
      <div
        className={`min-h-0 flex-1 flex-col overflow-y-auto p-4 ${
          sheetOpen ? 'flex' : 'hidden'
        } lg:flex`}
      >
        {renderContent()}
      </div>

      {/* quick actions */}
      <div
        className={`shrink-0 border-t border-bg-border p-3 ${
          sheetOpen ? 'block' : 'hidden'
        } lg:block`}
      >
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {activeResult ? activeResult.originalName : t('status.noImage')}
        </p>
      </div>
    </aside>
  );
}

function toolIcon(tool: string): string {
  const icons: Record<string, string> = {
    select: 'box',
    brush: 'brush',
    eraser: 'eraser',
    crop: 'crop',
    text: 'text',
    shape: 'shape',
  };
  return icons[tool] ?? 'box';
}
