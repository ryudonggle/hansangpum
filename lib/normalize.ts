// 품목제조보고 레코드 정제: 상품명·업체명·원재료를 비교하기 좋은 꼴로 바꾼다.
// 원본은 건드리지 않고, 정제 결과를 옆에 붙여 쓴다.

export type RawRecord = {
  PRDLST_REPORT_NO: string;
  PRDLST_NM: string;
  BSSH_NM: string;
  LCNS_NO: string;
  PRDLST_DCNM: string;
  PRMS_DT: string;
  CHNG_DT?: string;
  RAWMTRL_NM?: string;
  RAWMTRL_ORDNO?: string;
};

export type NormalizedName = {
  key: string; // 띄어쓰기·기호를 뺀 비교용 이름 (브랜드·맛·종류는 남김)
  display: string; // 사람이 읽는 정제 이름
  brand: string | null; // [미스터]처럼 대괄호로 붙은 브랜드
  storage: string | null; // 냉동·냉장·실온 (보관 방식이 다르면 다른 상품)
  state: string | null; // 반제품·완제품·미절단 등
  weight: string | null; // 210g, 3kg (같은 상품의 용량 차이라 비교에서 뺌)
  pack: string | null; // 3입, 6개입
  channel: string | null; // 쿠팡 등 판매처 전용 표기
  market: string | null; // 수출용·미국용 (국내에서 파는 상품과 다름)
  format: string; // 포장 형태: 컵·큰컵·사발·용기·봉지 ("" = 표기 없음)
  stage: string; // 이유식 단계: 미음·묽은죽·된죽·죽·무른밥·진밥 ("" = 표기 없음)
  code: string | null; // 이름 앞 영문 1~2글자 라인 코드 (미두 "SB 닭가슴살버섯묽은죽"의 sb)
};

export type NormalizedCompany = {
  root: string; // 법인 표기·공장명을 뺀 회사 이름 ("하림산업")
  site: string | null; // 지워진 공장·지점 부분 ("함열식품1공장")
};

const STORAGE = /^(냉동|냉장|실온|상온)$/;
const STATE = /^(반제품|완제품|반|완|미절단.*|절단)$/;
const CHANNEL = /^(쿠팡|컬리|마켓컬리|이마트|홈플러스|코스트코|gs25|cu|세븐일레븐|샛별푸드)$/;
const MARKET = /^(.*수출용|수출|미국용?|일본|대만|중국|홍콩|베트남|내수용?)$/;
const NOISE = /^(레토르트식품|레토르트|스프)$/; // 유형 설명이라 이름에서 뺌

// 상품을 가르는 축(variant axis). 카테고리를 넓힐 때 여기에 단어를 더한다.
// 라면: 봉지 ↔ 컵 ↔ 큰사발은 다른 상품 / 이유식: 된죽 ↔ 죽 ↔ 진밥은 다른 상품
const FORMAT = /(큰사발|사발|큰컵|소컵|컵|용기|봉지)(?:면|용)?(?=\s|$)/;
const STAGE = /(묽은죽|된죽|옹근죽|미음|무른밥|진밥|영양밥|죽)$/;
const WEIGHT = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-z])/i;
const PACK = /(\d+)\s*(개입|입|팩|봉)(?![가-힣])/;

export const squash = (s: string) => s.replace(/[\s\-_.·,!?~'"`/]+/g, "");

export function normalizeName(raw: string): NormalizedName {
  let s = raw.normalize("NFKC").toLowerCase().trim();
  const out: NormalizedName = {
    key: "", display: "", brand: null, storage: null, state: null, weight: null, pack: null, channel: null,
    market: null, format: "", stage: "", code: null,
  };

  // 이름 앞 영문 1~2글자 코드: 같은 상품에 라인 코드만 붙였다 뗐다 한다 (S·SB·SD·CP)
  s = s.replace(/^([a-z]{1,2})(?=\s|[가-힣])\s*/, (_, c: string) => ((out.code = c), ""));

  // [브랜드] 접두어
  s = s.replace(/^\[([^\]]+)\]\s*/, (_, b: string) => ((out.brand = b.trim()), ""));

  // 괄호 안 내용 분류: 알려진 꼬리표만 떼고, 나머지(맛·구성)는 이름에 남긴다
  s = s.replace(/[(\[]([^)\]]*)[)\]]/g, (_, inner: string) => {
    const t = inner.trim();
    if (STORAGE.test(t)) return (out.storage = t), " ";
    if (STATE.test(t)) return (out.state = t), " ";
    if (CHANNEL.test(t)) return (out.channel = t), " ";
    if (MARKET.test(t)) return (out.market = t), " ";
    if (NOISE.test(t)) return " ";
    if (WEIGHT.test(t) && t.replace(WEIGHT, "").trim() === "") return (out.weight = t.replace(/\s/g, "")), " ";
    if (PACK.test(t) && t.replace(PACK, "").trim() === "") return (out.pack = t.replace(/\s/g, "")), " ";
    return ` ${t} `;
  });

  // 괄호 밖 중량·입수 (210g 닭가슴살볶음밥, 곤약볶음밥3kg, x 3입)
  s = s.replace(new RegExp(WEIGHT.source, "gi"), (m) => ((out.weight ??= m.replace(/\s/g, "")), " "));
  s = s.replace(new RegExp(PACK.source, "g"), (m) => ((out.pack ??= m.replace(/\s/g, "")), " "));
  s = s.replace(/(^|\s)[x×*](?=\s|$)/g, " ");

  // 괄호 없이 맨 뒤에 붙은 보관 표기 ("닭가슴살 메추리장 냉동")
  s = s.replace(/\s(냉동|냉장|실온|상온)\s*$/, (_, t: string) => ((out.storage ??= t), ""));
  s = s.replace(/(^|\s)(\S*수출용)(?=\s|$)/, (_, pre: string, m: string) => ((out.market ??= m), pre));

  out.display = s.replace(/\s+/g, " ").trim();
  out.key = squash((out.brand ?? "") + out.display); // 브랜드가 다르면 다른 상품
  out.format = out.display.match(FORMAT)?.[1] ?? "";
  out.stage = out.key.match(STAGE)?.[1] ?? "";
  return out;
}

const LEGAL = /\(주\)|㈜|주\)|\(주|주식회사|유한회사|\(유\)|농업회사법인|영농조합법인|농업법인|협동조합/g;
const SITE = /^(제?\d+공장|.*(공장|지점|센터|사업장|사업소)|central|kitchen)$/i;

export function normalizeCompany(raw: string): NormalizedCompany {
  const s = raw.normalize("NFKC").replace(/\([^)]*\)/g, (m) => (/\(주\)|\(유\)/.test(m) ? m : " "));
  const cleaned = s.replace(LEGAL, " ").replace(/(\D)(제?\d+공장)/g, "$1 $2");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const keep: string[] = [];
  const site: string[] = [];
  for (const t of tokens) (keep.length && SITE.test(t) ? site : keep).push(t);
  // 첫 토큰이 회사 이름, 그 뒤는 사업장(공장·센터·지역명)
  const [root = "", ...rest] = keep;
  site.unshift(...rest);
  return { root: root.toLowerCase(), site: site.length ? site.join(" ") : null };
}

// 같은 회사 계열인지: 이름이 같거나 한쪽이 다른 쪽으로 시작 ("하림" ⊂ "하림산업")
export function sameCompanyFamily(a: NormalizedCompany, b: NormalizedCompany): boolean {
  if (!a.root || !b.root) return false;
  if (a.root === b.root) return true;
  const [short, long] = a.root.length <= b.root.length ? [a.root, b.root] : [b.root, a.root];
  return short.length >= 2 && long.startsWith(short);
}

// 원재료: 쉼표로 나누되 괄호 안 쉼표는 무시, RAWMTRL_ORDNO 순서대로 정렬
export function parseRawMaterials(names = "", ordnos = ""): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of names) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const items = parts
    .map((p) => squash(p.normalize("NFKC").replace(/\([^)]*\)/g, "").trim().toLowerCase()))
    .filter(Boolean);
  const order = ordnos.split(",").map(Number);
  if (order.length !== items.length || order.some(Number.isNaN)) return items;
  return items.map((name, i) => ({ name, o: order[i] })).sort((x, y) => x.o - y.o).map((x) => x.name);
}

export type NormalizedRecord = {
  reportNo: string;
  name: NormalizedName;
  company: NormalizedCompany;
  licenseNo: string;
  type: string;
  materials: string[];
  reportedAt: string;
};

export function normalizeRecord(r: RawRecord): NormalizedRecord {
  return {
    reportNo: r.PRDLST_REPORT_NO,
    name: normalizeName(r.PRDLST_NM),
    company: normalizeCompany(r.BSSH_NM),
    licenseNo: r.LCNS_NO,
    type: r.PRDLST_DCNM,
    materials: parseRawMaterials(r.RAWMTRL_NM, r.RAWMTRL_ORDNO),
    reportedAt: r.PRMS_DT,
  };
}
