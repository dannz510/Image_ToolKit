import { useEffect } from 'react';
import { useStudio } from '../../contexts/StudioContext';
import { checkApiHealth } from '../../services/api';
import { TopBar } from './TopBar';
import { LeftSidebar } from './LeftSidebar';
import { RightPanel } from './RightPanel';
import { StatusBar } from './StatusBar';
import { DropZone } from '../workspace/DropZone';
import { ComparisonView } from '../workspace/ComparisonView';
import { CanvasWorkspace } from '../workspace/CanvasWorkspace';
import { BatchQueue } from '../batch/BatchQueue';
import { ProcessingOverlay } from '../workspace/ProcessingOverlay';
import { Icon } from '../ui/Icon';
import { useLanguage } from '../../contexts/LanguageContext';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

/**
 * App shell: fixed full-viewport grid. Panels reflow on tablet (stacked) and
 * phone (single column) breakpoints.
 */
export function AppShell() {
  const {
    viewMode,
    setViewMode,
    files,
    isDragging,
    setApiOnline,
    processActive,
    processBatch,
    downloadAllZip,
  } = useStudio();
  const { t } = useLanguage();

  // Global shortcuts. Ctrl/Cmd combos are declared first so they take
  // precedence over the plain-digit view switches below.
  useKeyboardShortcuts([
    {
      key: 'z',
      ctrlKey: true,
      description: 'undo in workspace',
      action: () => window.dispatchEvent(new CustomEvent('dannz:undo')),
    },
    {
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
      description: 'redo in workspace',
      action: () => window.dispatchEvent(new CustomEvent('dannz:redo')),
    },
    {
      key: 'Enter',
      ctrlKey: true,
      description: 'process active image',
      action: () => void processActive(),
    },
    {
      key: 'Enter',
      ctrlKey: true,
      shiftKey: true,
      description: 'process batch',
      action: () => void processBatch(),
    },
    {
      key: 's',
      ctrlKey: true,
      description: 'download all results as zip',
      action: () => void downloadAllZip(),
    },
    { key: '1', description: 'single view', action: () => setViewMode('single') },
    { key: '2', description: 'batch view', action: () => setViewMode('batch') },
    { key: '3', description: 'workspace view', action: () => setViewMode('workspace') },
  ]);

  // Probe the API once on mount so status dots are truthful.
  useEffect(() => {
    void checkApiHealth().then(setApiOnline);
  }, [setApiOnline]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg-primary">
      <TopBar />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <LeftSidebar />

        <main className="relative min-h-0 min-w-0 flex-1">
          {files.length === 0 && <DropZone />}
          {files.length > 0 && viewMode === 'single' && <ComparisonView />}
          {files.length > 0 && viewMode === 'batch' && <BatchQueue />}
          {files.length > 0 && viewMode === 'workspace' && <CanvasWorkspace />}

          <ProcessingOverlay />

          {/* global drag veil */}
          {isDragging && (
            <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-accent-primary bg-accent-primary/10">
              <div className="text-center">
                <Icon name="download-cloud" size={34} className="mx-auto text-accent-primary" />
                <p className="mt-2 font-display text-lg font-bold uppercase tracking-widest text-text-primary">
                  {t('drop.title')}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                  {t('status.images', { count: files.length })}
                </p>
              </div>
            </div>
          )}
        </main>

        <RightPanel />
      </div>

      <StatusBar />
    </div>
  );
}
