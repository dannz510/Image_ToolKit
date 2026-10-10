import { useState } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { AIPanel } from '../panels/AIPanel';
import { AdjustPanel } from '../panels/AdjustPanel';
import { RegionPanel } from '../panels/RegionPanel';
import { HistoryPanel, LayersPanel, PresetsPanel } from '../panels/SidePanels';
import { Icon } from '../ui/Icon';

const TABS = [
  { id: 'ai', labelKey: 'panel.ai', icon: 'brain' },
  { id: 'adjust', labelKey: 'panel.adjust', icon: 'palette' },
  { id: 'region', labelKey: 'panel.region', icon: 'brush' },
  { id: 'presets', labelKey: 'panel.presets', icon: 'star' },
  { id: 'layers', labelKey: 'panel.layers', icon: 'layers' },
  { id: 'history', labelKey: 'panel.history', icon: 'clock' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function RightPanel() {
  const [tab, setTab] = useState<TabId>('ai');
  const { t } = useLanguage();
  const { activeResult } = useStudio();

  return (
    <aside className="relative z-20 flex min-h-0 flex-col border-t border-bg-border bg-bg-secondary/60 backdrop-blur-md lg:h-full lg:w-[320px] lg:border-l lg:border-t-0">
      {/* tab strip */}
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-bg-border px-1.5 py-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              tab === item.id
                ? 'bg-accent-primary/12 text-accent-primary'
                : 'text-text-muted hover:bg-bg-tertiary hover:text-text-primary'
            }`}
            aria-current={tab === item.id}
          >
            <Icon name={item.icon} size={13} />
            <span className="hidden xl:inline">{t(item.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'ai' && <AIPanel />}
        {tab === 'adjust' && <AdjustPanel />}
        {tab === 'region' && <RegionPanel />}
        {tab === 'presets' && <PresetsPanel />}
        {tab === 'layers' && <LayersPanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>

      {/* quick actions */}
      <div className="shrink-0 border-t border-bg-border p-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {activeResult ? activeResult.originalName : t('status.noImage')}
        </p>
      </div>
    </aside>
  );
}
