import { useState, useCallback } from "react";
import type { ReleaseChannel } from "../lib/releaseBuild";

export type UpdateStatus = "idle" | "checking" | "downloading" | "ready" | "error";
export type UpdateCheckResultStatus = "available" | "up-to-date" | "error" | "portable";

export interface UpdateCheckResult {
  requestId?: string;
  status: UpdateCheckResultStatus;
  version?: string;
  message?: string;
}

export const CHECK_RESULT_EVENT = "update-check-result";
export const RECEIVE_BETA_SETTING = "app.receive_beta_updates";
export const BETA_AVAILABLE_EVENT = "beta-update-available";
export const getAvailableBetaVersion = () => null;
export const requestBetaUpdateDialog = () => {};
export const isBetaVersion = (_version: string) => false;

export const useAutoUpdate = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>("idle");

  const checkUpdate = useCallback(async () => {
    setStatus("idle");
  }, []);

  const onStartDownload = useCallback(async () => {}, []);
  const onApplyUpdate = useCallback(async () => {}, []);
  const onClose = useCallback(() => setIsOpen(false), []);

  return {
    isOpen,
    status,
    version: "",
    notes: "",
    important: false,
    offeredChannel: "stable" as ReleaseChannel,
    downloadProgress: 0,
    checkUpdate,
    onStartDownload,
    onApplyUpdate,
    onClose,
  };
};
