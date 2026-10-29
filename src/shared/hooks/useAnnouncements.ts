import { useState, useCallback } from "react";
import type { Announcement } from "../types/announcement";

export function buildPingUrl(_pingUrl: string, _version: string, _pingId: string | null): string {
  return "";
}

export function useAnnouncements() {
  const [announcements] = useState<Announcement[]>([]);
  const [loading] = useState(false);

  const dismissAnnouncement = useCallback((_id: string) => {}, []);

  return {
    announcements,
    loading,
    dismissAnnouncement,
  };
}
