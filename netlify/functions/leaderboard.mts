import { getStore } from "@netlify/blobs";

type LeaderboardEntry = { name: string; score: number };

const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

const playerKey = async (name: string) => {
  const bytes = new TextEncoder().encode(name.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `player-${Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
};

const getRankings = async () => {
  const store = getStore({ name: "quake-leaderboard", consistency: "strong" });
  const { blobs } = await store.list();
  const entries = await Promise.all(
    blobs.map((blob) =>
      store.get(blob.key, { consistency: "strong", type: "json" }),
    ),
  );
  return (entries.filter(Boolean) as LeaderboardEntry[])
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 100);
};

export default async (request: Request) => {
  if (request.method === "GET") return json(await getRankings());
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Partial<LeaderboardEntry>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const score = Number(body.score);
  if (!name || name.length > 18 || !Number.isSafeInteger(score) || score < 0) {
    return json({ error: "Name or score is invalid" }, 400);
  }

  const store = getStore({ name: "quake-leaderboard", consistency: "strong" });
  const key = await playerKey(name);
  const existing = (await store.get(key, {
    consistency: "strong",
    type: "json",
  })) as LeaderboardEntry | null;
  const entry = {
    name: existing?.name ?? name,
    score: Math.max(existing?.score ?? 0, score),
  };
  await store.setJSON(key, entry);

  return json(await getRankings());
};

