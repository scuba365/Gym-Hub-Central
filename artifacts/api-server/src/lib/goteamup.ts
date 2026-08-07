export const GOTEAMUP_BASE = "https://goteamup.com/api/v2";
export const PAGE_SIZE = 100;

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

export async function goteamupFetch(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GoTeamUp API error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

export async function goteamupFetchAll<T>(startUrl: string, token: string): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = startUrl;
  let pages = 0;
  while (nextUrl && pages < 50) {
    const data = await goteamupFetch(nextUrl, token) as PaginatedResponse<T>;
    all.push(...data.results);
    nextUrl = data.next || null;
    pages++;
  }
  return all;
}
