// 검색 조건을 지원하지 않는 서비스(C006 등)를 처음부터 끝까지 훑어, 조건에 맞는 행만 남긴다.
// 1,000건씩 받고 진행 위치를 저장해 두어 끊겨도 이어서 받는다.
// 식품안전나라는 CHNG_DT(최근 7일 증분) 없이 부르면 1시간에 100회까지만 허용한다 → 시간당 PER_HOUR회로 천천히 부르고,
// 제한(INFO-320)에 걸리면 15분 기다렸다 같은 위치부터 다시 부른다.
// 사용: node scripts/ingest-scan.mjs <저장 이름> --service=C006 [--match=정규식]
//   예: node scripts/ingest-scan.mjs 닭가슴살 --service=C006 --match="닭가슴|치킨브레스트"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

try { process.loadEnvFile(".env"); } catch {}
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const SERVICE = arg("service") || "C006";
const KEY = process.env[`FOODSAFETY_KEY_${SERVICE}`] || process.env.FOODSAFETY_KEY;
if (!KEY) throw new Error(".env에 FOODSAFETY_KEY가 없습니다");
const name = process.argv[2] || "all";
const MATCH = new RegExp(arg("match") || "닭가슴|치킨브레스트", "i");
const PAGE = 1000;
const PER_HOUR = Number(arg("per-hour") || 95);
const mask = (s) => String(s).replaceAll(KEY, "[키]");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync("data/raw", { recursive: true });
const out = `data/raw/${SERVICE.toLowerCase()}-${name}.jsonl`;
const state = `data/raw/.scan-${SERVICE.toLowerCase()}-${name}.json`;
let { next = 1, total = Infinity, kept = 0 } = existsSync(state) ? JSON.parse(readFileSync(state, "utf8")) : {};
if (next === 1 && existsSync(out)) writeFileSync(out, "");

async function page(start) {
  const url = `https://openapi.foodsafetykorea.go.kr/api/${KEY}/${SERVICE}/json/${start}/${start + PAGE - 1}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const body = (await (await fetch(url, { signal: AbortSignal.timeout(60_000) })).json())[SERVICE];
      if (!body) throw new Error("응답에 서비스 키 없음");
      if (body.RESULT?.CODE === "INFO-200") return { total: 0, rows: [] };
      if (body.RESULT?.CODE === "INFO-320") {
        console.log(`호출 제한(시간당 100회)에 걸려 15분 기다립니다 · ${new Date().toLocaleTimeString("ko-KR")}`);
        await sleep(15 * 60_000);
        attempt = 0;
        continue;
      }
      if (body.RESULT?.CODE !== "INFO-000") throw new Error(`${body.RESULT?.CODE} ${body.RESULT?.MSG}`);
      return { total: Number(body.total_count), rows: body.row ?? [] };
    } catch (e) {
      if (attempt >= 5) throw new Error(mask(e.message));
      await sleep(2000 * attempt);
    }
  }
}

const startedAt = Date.now();
while (next <= total) {
  const { total: t, rows } = await page(next);
  total = t;
  const hits = rows.filter((r) => MATCH.test(r.PRDLST_NM ?? "") || MATCH.test(r.RAWMTRL_NM ?? ""));
  if (hits.length) appendFileSync(out, hits.map((r) => JSON.stringify(r)).join("\n") + "\n");
  kept += hits.length;
  next += PAGE;
  writeFileSync(state, JSON.stringify({ next, total, kept }));
  const done = Math.min(next - 1, total);
  if ((done / PAGE) % 10 === 0 || next > total)
    console.log(`${done.toLocaleString()} / ${total.toLocaleString()} 훑음 · 남긴 행 ${kept.toLocaleString()} · ${Math.round((Date.now() - startedAt) / 1000)}초`);
  if (rows.length === 0) break;
  await sleep(3_600_000 / PER_HOUR);
}
console.log(`완료: ${out} (남긴 행 ${kept.toLocaleString()}건, 품목보고번호 기준 중복 포함)`);
