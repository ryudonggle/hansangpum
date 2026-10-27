// /admin 조회·검수. 서버에서만 부른다.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "../../db/client.ts";

const CATEGORY = "닭가슴살";
export const DECISIONS = ["같음", "OEM", "다름"] as const;
export type Decision = (typeof DECISIONS)[number];

// 관리자 쿠키: 비밀번호 자체가 아니라 비밀번호로 서명한 값만 저장한다
export const ADMIN_COOKIE = "admin";
const sign = (v: string) => createHmac("sha256", process.env.ADMIN_PASSWORD ?? "").update(v).digest("hex");
export const adminToken = () => sign("admin-v1");
export function isAdmin(cookie: string | undefined) {
  if (!process.env.ADMIN_PASSWORD || !cookie) return false;
  const [a, b] = [Buffer.from(cookie), Buffer.from(adminToken())];
  return a.length === b.length && timingSafeEqual(a, b);
}
export function passwordMatches(input: string) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const [a, b] = [Buffer.from(sign(input)), Buffer.from(sign(expected))];
  return expected.length > 0 && timingSafeEqual(a, b);
}

export type DayRow = { day: string; searches: number; zero: number; clicks: number; outbound: number };

// 최근 14일, 하루 단위 (한국 시간). 이벤트가 없는 날도 0으로 채운다
export async function dailyEvents(): Promise<DayRow[]> {
  const rows = await sql`
    with days as (
      select generate_series((now() at time zone 'Asia/Seoul')::date - 13, (now() at time zone 'Asia/Seoul')::date, interval '1 day')::date as day
    )
    select to_char(d.day, 'MM-DD') as day,
           count(*) filter (where e.type = 'search')::int as searches,
           count(*) filter (where e.type = 'search' and e.result_count = 0)::int as zero,
           count(*) filter (where e.type = 'result_click')::int as clicks,
           count(*) filter (where e.type = 'outbound_click')::int as outbound
    from days d
    left join events e on (e.created_at at time zone 'Asia/Seoul')::date = d.day
    group by d.day order by d.day`;
  return rows as unknown as DayRow[];
}

export async function topQueries() {
  return (await sql`
    select query, count(*)::int as n, min(result_count)::int as min_results,
           (select count(*) from events c where c.type = 'result_click' and c.query = s.query)::int as clicks
    from events s where type = 'search' and query is not null and created_at > now() - interval '14 days'
    group by query order by n desc, query limit 8`) as unknown as { query: string; n: number; min_results: number; clicks: number }[];
}

export type ReviewRow = {
  a: string; b: string; aName: string; bName: string; company: string; aDate: string; bDate: string;
  reason: string; jevSame: number | null; materialSim: number | null;
};

export async function reviewQueue(limit = 8) {
  const [{ pending, decided }] = await sql`
    select count(*) filter (where decision is null)::int as pending, count(*) filter (where decision is not null)::int as decided
    from review_items where category = ${CATEGORY}`;
  const rows = await sql`
    select v.a, v.b, v.reason, v.jev_same, ra.product_name as a_name, rb.product_name as b_name, ra.company_name as company,
           ra.reported_at as a_date, rb.reported_at as b_date, c.material_sim
    from review_items v
    join records ra on ra.report_no = v.a
    join records rb on rb.report_no = v.b
    left join candidate_pairs c on c.a = v.a and c.b = v.b
    where v.category = ${CATEGORY} and v.decision is null
    order by v.jev_same desc nulls last, v.a, v.b
    limit ${limit}`;
  return {
    pending: pending as number,
    decided: decided as number,
    rows: rows.map((r) => ({
      a: r.a, b: r.b, aName: r.a_name, bName: r.b_name, company: r.company, aDate: r.a_date, bDate: r.b_date,
      reason: r.reason, jevSame: r.jev_same, materialSim: r.material_sim,
    })) as ReviewRow[],
  };
}

export async function decide(a: string, b: string, decision: Decision) {
  await sql`update review_items set decision = ${decision}, decided_at = now() where a = ${a} and b = ${b}`;
  // 사람 판정은 판정 캐시에도 남긴다 (다음 묶기 실행 때 Jev보다 먼저 쓴다)
  const relation = decision === "같음" ? "same_product" : decision === "OEM" ? "oem_sibling" : "different_product";
  await sql`
    insert into pair_judgments (a, b, source, relation, judged_at) values (${a}, ${b}, 'human', ${relation}, now())
    on conflict (a, b, source) do update set relation = excluded.relation, judged_at = excluded.judged_at`;
}
