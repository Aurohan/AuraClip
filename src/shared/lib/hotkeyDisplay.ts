export type HotkeyDisplayToken = {
  raw: string;
  label: string;
  isSymbol: boolean;
};

const PLAIN_LABELS: Record<string, string> = {
  COMMAND: "Command",
  CMD: "Command",
  META: "Meta",
  WIN: "Win",
  SUPER: "Super",
  OPTION: "Option",
  ALT: "Alt",
  SHIFT: "Shift",
  CTRL: "Ctrl",
  CONTROL: "Ctrl",
  ESCAPE: "Esc",
  RETURN: "Enter",
  SPACEBAR: "Space",
  ARROWUP: "Up",
  ARROWDOWN: "Down",
  ARROWLEFT: "Left",
  ARROWRIGHT: "Right",
  PAGEUP: "PgUp",
  PAGEDOWN: "PgDn"
};

const normalizePart = (raw: string): string => raw.trim();

const toToken = (part: string): HotkeyDisplayToken => {
  const raw = normalizePart(part);
  const key = raw.toUpperCase();

  const plain = PLAIN_LABELS[key];
  if (plain) return { raw, label: plain, isSymbol: false };
  return { raw, label: raw, isSymbol: false };
};

export const getHotkeyDisplayTokens = (hotkey: string | undefined): HotkeyDisplayToken[] => {
  const value = (hotkey || "").trim();
  if (!value) return [];

  return value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(toToken);
};
