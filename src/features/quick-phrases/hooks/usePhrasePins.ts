import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function usePhrasePins(pushToast: (message: string) => void) {
  const [pins, setPins] = useState<number[]>([]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    invoke<number[]>("get_phrase_pins")
      .then((value) => {
        if (!disposed) setPins(value);
      })
      .catch(console.error);

    listen<number[]>("quick-phrase-pins-changed", (event) => setPins(event.payload))
      .then((off) => {
        if (disposed) off();
        else unlisten = off;
      })
      .catch(console.error);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const togglePin = useCallback(async (id: number) => {
    try {
      setPins(await invoke<number[]>("toggle_phrase_pin", { id }));
    } catch (error) {
      console.error("toggle phrase pin:", error);
      pushToast("设置置顶失败");
    }
  }, [pushToast]);

  return { pins, togglePin };
}
