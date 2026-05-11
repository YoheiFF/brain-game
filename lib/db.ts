import "server-only";
import { createClient, type Client } from "@libsql/client/web";

let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "[BrainGame] TURSO_DATABASE_URL または TURSO_AUTH_TOKEN が未設定です。" +
      ".env.local を確認してください。"
    );
  }

  client = createClient({
    url,
    authToken,
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      return fetch(input, { ...init, signal: controller.signal }).finally(() =>
        clearTimeout(timeoutId)
      );
    },
  });
  return client;
}
