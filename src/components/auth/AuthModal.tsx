import { useState } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";
import { exportSyncFile, importSyncFile } from "../../services/auth";
import { downloadBlob } from "../../services/zip";
import { useToast } from "../../utils/toast";

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful sign-in / sign-up. */
  onAuth?: () => void;
}

export function AuthModal({ open, onClose, onAuth }: AuthModalProps) {
  const { t } = useLanguage();
  const { login, register, refresh, user } = useAuth();
  const { success, error } = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const account =
        mode === "login"
          ? await login(email, password)
          : await register(email, password, name);
      success(mode === "login" ? "auth.welcome" : "auth.created", {
        name: account.name,
      });
      onAuth?.();
      onClose();
    } catch (err) {
      // Errors may carry extra data after a pipe, e.g. "auth.rateLimited|42".
      const raw = err instanceof Error ? err.message : "auth.invalid";
      const [key, seconds] = raw.split("|");
      error(key, seconds ? { seconds } : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncExport = async () => {
    const account = user ?? {
      id: "guest",
      email: "guest@local",
      name: t("auth.localAccount"),
      createdAt: Date.now(),
    };
    const file = await exportSyncFile(account);
    downloadBlob(
      new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
      "dannz-sync.json",
    );
    success("auth.syncExport");
  };

  const handleSyncImport = async (file: File) => {
    try {
      await importSyncFile(file);
      refresh();
      success("auth.syncDone");
    } catch {
      error("auth.syncFail");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("auth.localAccount")}>
      <div className="mb-5 flex rounded-lg bg-bg-primary p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              mode === m
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(m === "login" ? "auth.signIn" : "auth.signUp")}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <label className="block">
            <span className="label-caps">{t("auth.name")}</span>
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        )}
        <label className="block">
          <span className="label-caps">{t("auth.email")}</span>
          <input
            type="email"
            required
            className="input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="block">
          <span className="label-caps">{t("auth.password")}</span>
          <input
            type="password"
            required
            minLength={8}
            className="input mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
          {mode === "register" && (
            <span className="mt-1 block font-mono text-[10px] text-text-muted">
              {t("auth.weakPassword")}
            </span>
          )}
        </label>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          <Icon name="shield" size={15} />
          {t(mode === "login" ? "auth.signIn" : "auth.signUp")}
        </button>
      </form>

      <div className="mt-5 space-y-2 border-t border-bg-border pt-4">
        <p className="font-mono text-[10px] leading-relaxed text-text-muted">
          {t("auth.localNote")}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSyncExport}
            className="btn-secondary flex-1 text-xs"
          >
            <Icon name="download" size={13} />
            {t("auth.syncExport")}
          </button>
          <label className="btn-secondary flex-1 cursor-pointer text-xs">
            <Icon name="upload" size={13} />
            {t("auth.syncImport")}
            <input
              type="file"
              accept="application/json"
              autoComplete="off"
              className="file-input-offscreen"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleSyncImport(file);
                // Clear synchronously: the modal closes right after, so a
                // deferred reset would never run.
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
