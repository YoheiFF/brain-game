const KEY = "braingame_nickname";

export function getNickname(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setNickname(name: string) {
  localStorage.setItem(KEY, name.trim());
}

export function hasNickname(): boolean {
  return Boolean(getNickname());
}
