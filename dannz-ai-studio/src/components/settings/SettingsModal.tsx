import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { SelectRow } from '../ui/Fields';
import { clearAllData, currentUser, exportSyncFile, type PublicAccount } from '../../services/auth';
import { downloadBlob } from '../../services/zip';
import { unregisterServiceWorker } from '../../utils/registerSW';
import { useToast } from '../../utils/toast';

const APP_VERSION = '2.0.0';

export function SettingsModal({
  open,
  onClose,
  user,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  user: PublicAccount | null;
  onLogout: () => void;
}) {
  const { t, lang, setLang } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { success, info } = useToast();
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = async () => {
    await clearAllData();
    // A wiped profile must not survive inside the offline cache.
    await unregisterServiceWorker();
    success('settings.cleared');
    setConfirmClear(false);
    onClose();
  };

  const handleSyncExport = async () => {
    const account = currentUser() ?? {
      id: 'guest',
      email: 'guest@local',
      name: t('auth.localAccount'),
      createdAt: Date.now(),
    };
    const file = await exportSyncFile(account);
    downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), 'dannz-sync.json');
    success('auth.syncExport');
  };

  return (
    <Modal open={open} onClose={onClose} title={t('settings.title')}>
      <div className="space-y-6">
        {/* account */}
        <section className="space-y-2">
          <h3 className="label-caps">{t('nav.account')}</h3>
          {user ? (
            <div className="flex items-center gap-3 rounded-lg border border-bg-border bg-bg-primary/60 p-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-primary/15 text-accent-primary">
                <Icon name="shield" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-ui text-sm text-text-primary">{user.name}</p>
                <p className="truncate font-mono text-[10px] text-text-muted">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  info('nav.logout');
                  onClose();
                }}
                className="btn-ghost !px-2.5 !py-1 text-[11px]"
              >
                {t('nav.logout')}
              </button>
            </div>
          ) : (
            <p className="font-mono text-xs text-text-muted">
              {t('auth.localNote')}
            </p>
          )}
          <button type="button" onClick={handleSyncExport} className="btn-secondary w-full text-xs">
            <Icon name="download-cloud" size={14} />
            {t('auth.syncExport')}
          </button>
        </section>

        {/* appearance */}
        <section className="space-y-3">
          <h3 className="label-caps">{t('settings.appearance')}</h3>
          <SelectRow
            label={t('settings.theme')}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'dark', label: t('nav.theme.dark') },
              { value: 'light', label: t('nav.theme.light') },
            ]}
          />
          <SelectRow
            label={t('settings.language')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: 'English' },
              { value: 'vi', label: 'Tiếng Việt' },
            ]}
          />
        </section>

        {/* data */}
        <section className="space-y-2">
          <h3 className="label-caps">{t('settings.data')}</h3>
          {confirmClear ? (
            <div className="rounded-lg border border-error/40 bg-error/5 p-3">
              <p className="mb-2 font-mono text-xs text-text-secondary">
                {t('settings.clearConfirm')}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={handleClear} className="btn-danger flex-1 text-xs">
                  {t('common.confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="btn-ghost flex-1 text-xs"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="btn-secondary w-full text-xs"
            >
              <Icon name="trash" size={14} />
              {t('settings.clearData')}
            </button>
          )}
        </section>

        {/* about */}
        <section className="space-y-1 border-t border-bg-border pt-4">
          <h3 className="label-caps">{t('settings.about')}</h3>
          <dl className="font-mono text-[11px] text-text-muted">
            <div className="flex justify-between">
              <dt>{t('app.name')}</dt>
              <dd>Dannz AI Studio</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('settings.version')}</dt>
              <dd>{APP_VERSION}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('settings.author')}</dt>
              <dd className="text-accent-primary">Dannz</dd>
            </div>
          </dl>
        </section>
      </div>
    </Modal>
  );
}
