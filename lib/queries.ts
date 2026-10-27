// 화면에서 쓰는 조회. 서버에서만 부른다.
import "server-only";
import { sql } from "../db/client.ts";
import { normalizeName } from "./normalize.ts";

export type GroupHit = {
  id: string;
  displayName: string;
  companyName: string;
  foodType: string;
  memberCount: number;
  reportDates: string[]; // 묶음 안 신고일 (YYYYMMDD), 오래된 순
  representativeDate: string;
  linkCount: number;
};

const CATEGORY = "닭가슴살";

export async function overview() {
  const [row] = await sql`
    select (select count(*) from records where category = ${CATEGORY})::int as records,
           (select count(*) from product_groups where category = ${CATEGORY})::int as groups,
           (select count(*) from product_groups where category = ${CATEGORY} and member_count > 1)::int as merged,
           (select count(*) from review_items where category = ${CATEGORY} and decision is null)::int as pending`;
  return row as { records: number; groups: number; merged: number; pending: number };
}

// 상품명(묶음 안 모든 신고의 원문 이름)·업체명으로 찾고, 묶음 단위로 돌려준다.
// 순위: 입력 그대로 포함 → 단어가 모두 포함(어순 무관) → 글자 유사도(pg_trgm, 띄어쓰기 뺀 name_key끼리)
export async function searchGroups(q: string, limit = 1000): Promise<GroupHit[]> {
  const esc = (v: string) => v.replace(/[%_\\]/g, (m) => `\\${m}`);
  const like = `%${esc(q)}%`;
  const key = normalizeName(q).key;
  const keyLike = `%${esc(key)}%`; // 띄어쓰기·기호를 무시한 포함 검색 ("닭가슴살 김치볶음밥" → "닭가슴살김치볶음밥")
  // 단어별 검색: 단어마다 상품명이나 업체명 어딘가에 있으면 된다 ("닭가슴살 하림" = "하림 닭가슴살")
  const words = [...new Set(q.split(/\s+/).map((w) => normalizeName(w).key).filter((w) => w.length > 0))].slice(0, 6);
  const wordLikes = words.map((w) => `%${esc(w)}%`);
  const rows = await sql`
    with hits as (
      select r.group_id,
             bool_or(r.product_name ilike ${like} or r.name_key like ${keyLike} or r.company_name ilike ${like}) as contains,
             bool_or(${words.length > 1} and (
               select bool_and(r.name_key like w or replace(lower(r.company_name), ' ', '') like w) from unnest(${wordLikes}::text[]) w
             )) as all_words,
             max(similarity(r.name_key, ${key})) as sim
      from records r
      where r.category = ${CATEGORY}
        and (r.product_name ilike ${like} or r.name_key like ${keyLike} or r.company_name ilike ${like}
             or similarity(r.name_key, ${key}) >= 0.45
             or (${words.length > 1} and (
               select bool_and(r.name_key like w or replace(lower(r.company_name), ' ', '') like w) from unnest(${wordLikes}::text[]) w
             )))
      group by r.group_id
    )
    select g.id, g.display_name, g.food_type, g.member_count, rep.company_name, rep.reported_at as rep_date,
           (select array_agg(m.reported_at order by m.reported_at) from records m where m.group_id = g.id) as dates,
           (select count(*) from group_links l where l.group_a = g.id or l.group_b = g.id)::int as links
    from hits h
    join product_groups g on g.id = h.group_id
    join records rep on rep.report_no = g.representative_id
    order by h.contains desc, h.all_words desc, h.sim desc, g.member_count desc, rep.reported_at desc
    limit ${limit}`;
  return rows.map((r) => ({
    id: r.id, displayName: r.display_name, companyName: r.company_name, foodType: r.food_type, memberCount: r.member_count,
    reportDates: r.dates, representativeDate: r.rep_date, linkCount: r.links,
  }));
}

export type GroupRecord = {
  reportNo: string; productName: string; companyName: string; licenseNo: string; foodType: string;
  reportedAt: string; changedAt: string | null; rawMaterials: string | null; rawOrder: string | null; isRepresentative: boolean;
};

export type Why = { aName: string; bName: string; how: string };

// 묶음 안에서 실제로 이어 붙인 쌍과 그 이유 (규칙 또는 Jev)
async function groupEvidence(id: string): Promise<Why[]> {
  const rows = await sql`
    select ra.product_name as a_name, rb.product_name as b_name, c.band, c.name_sim, c.material_sim,
           j.probabilities->>'same_product' as jev_same, h.relation as human
    from candidate_pairs c
    join records ra on ra.report_no = c.a and ra.group_id = ${id}
    join records rb on rb.report_no = c.b and rb.group_id = ${id}
    left join pair_judgments j on j.a = c.a and j.b = c.b and j.source = 'jev'
    left join pair_judgments h on h.a = c.a and h.b = c.b and h.source = 'human'
    where c.band in ('merge', 'ambiguous')
    order by c.band desc, c.name_sim desc limit 12`;
  return rows
    .filter((r) => r.human === "same_product" || r.band === "merge" || Number(r.jev_same) >= 0.7)
    .map((r) => ({
      aName: r.a_name,
      bName: r.b_name,
      how: r.human === "same_product" ? "사람이 같은 상품으로 확인"
        : r.band === "merge" ? (r.name_sim === 1 ? "규칙: 띄어쓰기·표기를 빼면 이름이 같음" : "규칙: 회사 이름만 앞에 더 붙음")
        : `Jev: 어순·띄어쓰기만 다름, 같은 상품일 확률 ${Number(r.jev_same).toFixed(2)} · 원재료 ${Math.round(r.material_sim * 100)}% 겹침`,
    }));
}

export async function groupDetail(id: string) {
  const [group] = await sql`select * from product_groups where id = ${id} and category = ${CATEGORY}`;
  if (!group) return null;
  const members = await sql`
    select report_no, product_name, company_name, license_no, food_type, reported_at, changed_at, raw_materials, raw->>'RAWMTRL_ORDNO' as raw_order
    from records where group_id = ${id} order by reported_at desc, report_no`;
  const links = await sql`
    select l.relation, l.probability, g.id, g.display_name, g.member_count, g.food_type
    from group_links l join product_groups g on g.id = case when l.group_a = ${id} then l.group_b else l.group_a end
    where l.group_a = ${id} or l.group_b = ${id}
    order by l.relation, l.probability desc, g.display_name limit 12`;
  const evidence = group.member_count > 1 ? await groupEvidence(id) : [];
  return {
    evidence,
    id: group.id as string,
    displayName: group.display_name as string,
    foodType: group.food_type as string,
    memberCount: group.member_count as number,
    representativeId: group.representative_id as string,
    members: members.map((m) => ({
      reportNo: m.report_no, productName: m.product_name, companyName: m.company_name, licenseNo: m.license_no, foodType: m.food_type,
      reportedAt: m.reported_at, changedAt: m.changed_at, rawMaterials: m.raw_materials, rawOrder: m.raw_order, isRepresentative: m.report_no === group.representative_id,
    })) as GroupRecord[],
    links: links.map((l) => ({ relation: l.relation as string, id: l.id as string, displayName: l.display_name as string, memberCount: l.member_count as number, foodType: l.food_type as string })),
  };
}

// 신고가 가장 많이 묶인 상품: 첫 화면에서 "묶음"이 무엇인지 보여 준다
export async function mostMerged(limit = 6): Promise<GroupHit[]> {
  const rows = await sql`
    select g.id, g.display_name, g.food_type, g.member_count, rep.company_name, rep.reported_at as rep_date,
           (select array_agg(m.reported_at order by m.reported_at) from records m where m.group_id = g.id) as dates,
           (select count(*) from group_links l where l.group_a = g.id or l.group_b = g.id)::int as links
    from product_groups g join records rep on rep.report_no = g.representative_id
    where g.category = ${CATEGORY} and g.member_count > 1
    order by g.member_count desc, rep.reported_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id, displayName: r.display_name, companyName: r.company_name, foodType: r.food_type, memberCount: r.member_count,
    reportDates: r.dates, representativeDate: r.rep_date, linkCount: r.links,
  }));
}
