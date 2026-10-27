// 요청 횟수 제한 (rate_limits 표). 서버에서만 부른다.
import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "../../db/client.ts";

// IP는 그대로 저장하지 않고 서버 비밀값으로 서명한 해시 앞부분만 쓴다 (IPv4는 맨 해시면 되돌릴 수 있다)
const ipKey = (ip: string) => createHmac("sha256", process.env.ADMIN_PASSWORD ?? "").update(ip).digest("hex").slice(0, 16);

// Vercel이 넣는 클라이언트 IP. 로컬에서는 없으므로 "local"
export const clientIp = (h: Headers) => h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

// 이번 칸에서 한 번 더 세고, 한도 안이면 true. ip를 빼면 범위 전체(모든 IP 합계)로 센다
export async function allow(scope: string, limit: number, windowSec: number, ip?: string) {
  const key = ip ? `${scope}:${ipKey(ip)}` : `${scope}:*`;
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const [{ hits }] = await sql`
    insert into rate_limits (key, "window", hits) values (${key}, ${window}, 1)
    on conflict (key, "window") do update set hits = rate_limits.hits + 1
    returning hits`;
  // 지난 칸은 가끔 지운다 (요청 100번에 한 번꼴)
  if (Math.random() < 0.01) await sql`delete from rate_limits where "window" < ${window} - 2 and key like ${scope + ":%"}`.catch(() => {});
  return (hits as number) <= limit;
}
