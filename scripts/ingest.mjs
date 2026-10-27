// 식품안전나라 품목제조보고 + 원재료 수집 → data/raw/<서비스>-<이름>.jsonl
//   C002 식품(기본), C006 축산물(햄·양념육·소시지 등). 두 서비스의 필드는 같다.
// 사용: node scripts/ingest.mjs <저장 이름> <조건...> [--service=C006] [--max=건수]
//   조건은 "필드=값" (PRDLST_NM 상품명, RAWMTRL_NM 원재료, BSSH_NM 업체명)
//   여러 조건의 결과를 합치고 품목보고번호(PRDLST_REPORT_NO)로 중복을 지운다.
//   예: node scripts/ingest.mjs 닭가슴살 PRDLST_NM=닭가슴살 RAWMTRL_NM=닭가슴살 PRDLST_NM=치킨브레스트
import { mkdirSync, writeFileSync } from "node:fs";

try { process.loadEnvFile(".env"); } catch {}
const SERVICE = process.argv.find((a) => a.startsWith("--service="))?.slice(10) || "C002";
// 서비스별 키가 따로 있으면 그것을, 없으면 공통 키를 쓴다
const KEY = process.env[`FOODSAFETY_KEY_${SERVICE}`] || process.env.FOODSAFETY_KEY || "sample";
const PAGE = KEY === "sample" ? 5 : 1000; // sample 키는 5건까지만 허용

const args = process.argv.slice(2);
const name = args[0] || "all";
const filters = args.slice(1).filter((a) => !a.startsWith("--"));
const limit = Number(args.find((a) => a.startsWith("--max="))?.slice(6) || 10000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 오류 메시지·로그에 키가 남지 않게 가린다
const mask = (s) => String(s).replaceAll(KEY, "[키]");

async function fetchPage(filter, start, end) {
  const path = filter ? `/${encodeURI(filter)}` : "";
  const url = `https://openapi.foodsafetykorea.go.kr/api/${KEY}/${SERVICE}/json/${start}/${end}${path}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const body = (await res.json())[SERVICE];
      if (!body) throw new Error("응답에 서비스 키 없음");
      const code = body.RESULT?.CODE;
      if (code === "INFO-200") return { total: 0, rows: [] }; // 데이터 없음
      if (code !== "INFO-000") throw new Error(`${code} ${body.RESULT?.MSG}`);
      return { total: Number(body.total_count), rows: body.row ?? [] };
    } catch (e) {
      if (attempt === 3) throw new Error(mask(e.message), { cause: e.cause?.code });
      await sleep(1000 * attempt);
    }
  }
}

async function fetchAll(filter) {
  const rows = [];
  let total = Infinity;
  for (let start = 1; start <= Math.min(total, limit); start += PAGE) {
    const end = Math.min(start + PAGE - 1, limit);
    const page = await fetchPage(filter, start, end);
    total = page.total;
    rows.push(...page.rows);
    console.log(`  ${filter || "(조건 없음)"}: ${rows.length} / ${Math.min(total, limit)}`);
    if (KEY === "sample" || page.rows.length === 0) break;
    await sleep(300);
  }
  return { rows, total };
}

const byReportNo = new Map();
for (const filter of filters.length ? filters : [""]) {
  const { rows, total } = await fetchAll(filter);
  let added = 0;
  for (const r of rows) {
    if (!byReportNo.has(r.PRDLST_REPORT_NO)) {
      byReportNo.set(r.PRDLST_REPORT_NO, { ...r, _matched_by: [filter] });
      added++;
    } else {
      byReportNo.get(r.PRDLST_REPORT_NO)._matched_by.push(filter);
    }
  }
  console.log(`${filter || "(조건 없음)"} → ${rows.length}건 받음 (전체 ${total}건), 새로 추가 ${added}건`);
}

mkdirSync("data/raw", { recursive: true });
const out = `data/raw/${SERVICE.toLowerCase()}-${name}.jsonl`;
const all = [...byReportNo.values()];
writeFileSync(out, all.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`저장: ${out} (중복 제거 후 ${all.length}건)`);
