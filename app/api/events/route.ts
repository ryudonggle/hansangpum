// 사용자 행동 로그: 검색·결과 클릭·상세 보기·외부 링크. 개인정보 없이 브라우저마다 임의의 세션 id만 남긴다.
import { NextResponse } from "next/server";
import { sql } from "../../../db/client.ts";
import { allow, clientIp } from "../../../lib/web/rate-limit.ts";

const TYPES = new Set(["search", "result_click", "product_view", "outbound_click"]);
const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);
const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e6 ? (v as number) : null);

// 한도: IP마다 1분 60건, 전체 1시간 5,000건 (스팸으로 DB 용량이 차거나 지표가 망가지지 않게)
export async function POST(req: Request) {
  if (!(await allow("events", 60, 60, clientIp(req.headers))) || !(await allow("events-all", 5000, 3600)))
    return NextResponse.json({ error: "요청이 너무 많습니다" }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON이 아닙니다" }, { status: 400 });
  }
  const type = str(body.type, 32);
  const sessionId = str(body.sessionId, 64);
  if (!type || !TYPES.has(type) || !sessionId || !/^[a-zA-Z0-9-]+$/.test(sessionId))
    return NextResponse.json({ error: "type 또는 sessionId가 올바르지 않습니다" }, { status: 400 });

  await sql`
    insert into events (session_id, type, query, group_id, result_count, rank)
    values (${sessionId}, ${type}, ${str(body.query, 100)}, ${str(body.groupId, 32)}, ${int(body.resultCount)}, ${int(body.rank)})`;
  return new NextResponse(null, { status: 204 });
}
