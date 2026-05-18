"use server";
import { getOrCreateFriendCode } from "@/lib/db-friends";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getMyFriendCode(userId: string): Promise<string> {
  if (!UUID_REGEX.test(userId)) throw new Error("invalid userId");
  return getOrCreateFriendCode(userId);
}
