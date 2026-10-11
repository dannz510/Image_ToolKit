import { useStudio } from '../../contexts/StudioContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Icon } from '../ui/Icon';
import type { ToolMode } from '../../types';

const TOOLS: { id: ToolMode; icon: string; labelKey: string }[] = [
  { id: 'select', icon: 'box', labelKey: 'tool.select' },
  { id: 'crop', icon: 'crop', labelKey: 'tool.crop' },
  { id: 'brush', icon: 'brush', labelKey: 'tool.brush' },
  { id: 'eraser', icon: 'eraser', labelKey: 'tool.eraser' },
  { id: 'text', icon: 'text', labelKey: 'tool.text' },
  { id: 'shape', icon: 'shape', labelKey: 'tool.shape' },
];

export function LeftSidebar() {
  const { tool, setTool, viewMode, setViewMode, files, isProcessing, processActive } = useStudio();
  const { t } = useLanguage();

  return (
     <aside className="relative z-20 flex w-full shrink-0 flex-row items-center gap-1 overflow-x-auto border-b border-bg-border/40 bg-bg-secondary/45 px-2 py-1.5 backdrop-blur-md lg:h-full lg:w-14 lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:border-bg-border/40 lg:px-1.5 lg:py-2">
      {/* Primary action: remove background */}
      <button
        type="button"
        onClick={() => (viewMode === 'batch' ? undefined : processActive())}
        disabled={isProcessing || files.length === 0}
        className="btn-primary glow-active !rounded-xl !px-2.5 !py-2 lg:!px-0"
        title={t('process.removeBg')}
        aria-label={t('process.removeBg')}
      >
        <Icon name="brain" size={18} />
        <span className="lg:hidden">{t('tool.removeBg')}</span>
      </button>

       <div className="mx-1 h-6 w-px bg-bg-border/30 lg:mx-auto lg:h-px lg:w-6" />

       {TOOLS.map((tool_) => (
        <button
          key={tool_.id}
          type="button"
          onClick={() => {
            setTool(tool_.id);
            setViewMode('workspace');
          }}
           className={`toolbar-btn !rounded-xl lg:!p-2.5 ${
             tool === tool_.id && viewMode === 'workspace' ? 'toolbar-btn-active' : ''
           }`}
          title={t(tool_.labelKey)}
          aria-label={t(tool_.labelKey)}
          aria-pressed={tool === tool_.id && viewMode === 'workspace'}
        >
          <Icon name={tool_.icon} size={17} />
        </button>
      ))}

      <div className="mx-1 h-6 w-px bg-bg-border lg:mx-auto lg:h-px lg:w-6" />

      <button
        type="button"
        onClick={() => setViewMode('batch')}
           className={`toolbar-btn !rounded-xl lg:!p-2.5 ${viewMode === 'batch' ? 'toolbar-btn-active' : ''}`}
        title={t('nav.batch')}
        aria-label={t('nav.batch')}
      >
        <Icon name="folder" size={17} />
      </button>
      <button
        type="button"
        onClick={() => setViewMode('single')}
           className={`toolbar-btn !rounded-xl lg:!p-2.5 ${viewMode === 'single' ? 'toolbar-btn-active' : ''}`}
        title={t('nav.single')}
        aria-label={t('nav.single')}
      >
        <Icon name="image" size={17} />
      </button>

      <div className="flex-1 lg:block hidden" />

      <button
        type="button"
        onClick={() => setViewMode('workspace')}
           className={`toolbar-btn !rounded-xl lg:!p-2.5 ${viewMode === 'workspace' ? 'toolbar-btn-active' : ''}`}
        title={t('nav.workspace')}
        aria-label={t('nav.workspace')}
      >
        <Icon name="edit" size={17} />
      </button>
    </aside>
  );
}
