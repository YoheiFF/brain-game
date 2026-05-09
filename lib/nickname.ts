const KEY = "braingame_nickname";
const KEY_AGE = "braingame_age";

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

export function getAge(): number | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(KEY_AGE);
  return v ? parseInt(v, 10) : null;
}

export function setAge(age: number) {
  localStorage.setItem(KEY_AGE, String(age));
}
