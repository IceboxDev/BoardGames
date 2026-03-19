import { apiClient } from "./api-client";

export async function saveGameResult(slug: string, result: unknown): Promise<void> {
  try {
    await apiClient.saveGameResult(slug, result);
  } catch {
    // Fall back to localStorage if server is unreachable
    const key = `${slug}_results`;
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]");
    existing.push(result);
    try {
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {
      // localStorage full or unavailable
    }
  }
}

export async function loadGameHistory<T = unknown>(slug: string): Promise<T[]> {
  try {
    return (await apiClient.getGameResults(slug)) as T[];
  } catch {
    const key = `${slug}_results`;
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  }
}

export async function clearHistory(slug: string): Promise<void> {
  try {
    await apiClient.clearGameResults(slug);
  } catch {
    localStorage.removeItem(`${slug}_results`);
  }
}
