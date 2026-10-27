// 두 정제 레코드가 같은 소비자 상품일 가능성을 규칙으로 점수 매긴다.
// 확실한 쌍은 규칙으로 끝내고, 애매한 쌍만 Jev에 묻는다.
import { sameCompanyFamily, squash, type NormalizedRecord } from "./normalize.ts";

// 글자 2개씩 자른 조각(bigram)이 얼마나 겹치는지: 한국어 붙여쓰기에 강하다
export function bigramDice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export type PairScore = {
  name: number; // 이름 bigram 유사도
  materials: number; // 원재료 Jaccard
  sameType: boolean; // 식품 유형(PRDLST_DCNM) 일치
  sameSite: boolean; // 같은 인허가번호(같은 공장)
  sameAfterCompany: boolean; // 회사 이름 접두어만 다름 ("엄지 닭가슴살볶음밥" ↔ "닭가슴살볶음밥")
  extraChars: number; // 한쪽에만 더 있는 글자 수 (어순·띄어쓰기만 다르면 0)
  extraWords: string | null; // 한쪽에만 통째로 더 있는 단어 ("흑닭 소불고기 닭가슴살볶음밥" ↔ "닭가슴살 소불고기볶음밥" → "흑닭")
  conflict: string | null; // 이게 있으면 규칙상 다른 상품
  total: number;
};

const WEIGHTS = { name: 0.6, materials: 0.3, type: 0.1 };

export function scorePair(a: NormalizedRecord, b: NormalizedRecord): PairScore {
  const name = bigramDice(a.name.key, b.name.key);
  const materials = jaccard(a.materials, b.materials);
  const sameType = a.type === b.type;
  const sameSite = a.licenseNo === b.licenseNo;
  const sameAfterCompany = stripCompany(a.name.key, a) === stripCompany(b.name.key, b);
  const extraChars = Math.max(charsOnlyIn(a, b), charsOnlyIn(b, a));
  const extraWords = sameAfterCompany ? null : (wholeExtraWords(a, b) ?? wholeExtraWords(b, a));

  let conflict: string | null = null;
  if (!sameCompanyFamily(a.company, b.company)) conflict = "회사 계열이 다름";
  else if (a.name.storage && b.name.storage && a.name.storage !== b.name.storage) conflict = "보관 방식이 다름";
  else if (a.name.state && b.name.state && a.name.state !== b.name.state) conflict = "상태 표기가 다름";
  else if (a.name.market && b.name.market && a.name.market !== b.name.market) conflict = "판매 국가가 다름";
  else if (!!a.name.market !== !!b.name.market) conflict = "수출용과 국내용";
  else if (a.name.format !== b.name.format) conflict = "포장 형태가 다름";
  else if (a.name.stage !== b.name.stage) conflict = "이유식 단계가 다름";
  else if (numbersOf(a.name.key) !== numbersOf(b.name.key)) conflict = "이름 속 숫자가 다름";
  else if (charsOnlyIn(a, b) > 0 && charsOnlyIn(b, a) > 0) conflict = "양쪽에 서로 다른 글자가 있음";
  else if (extraWords) conflict = "한쪽에만 단어가 더 있음";

  const total = conflict ? 0 : WEIGHTS.name * name + WEIGHTS.materials * materials + WEIGHTS.type * Number(sameType);
  return { name, materials, sameType, sameSite, sameAfterCompany, extraChars, extraWords, conflict, total: Math.round(total * 1000) / 1000 };
}

// x에만 있는 글자 수 (글자 개수 기준, 어순 무시, 회사 이름 접두어 제외).
// 양쪽 다 0보다 크면 한 단어가 다른 단어로 바뀐 것(군만두 ↔ 물만두, 간편한 ↔ 담백가득) → 다른 상품
function charsOnlyIn(x: NormalizedRecord, y: NormalizedRecord): number {
  const count = new Map<string, number>();
  for (const ch of stripCompany(y.name.key, y)) count.set(ch, (count.get(ch) ?? 0) + 1);
  let only = 0;
  for (const ch of stripCompany(x.name.key, x)) {
    const n = count.get(ch) ?? 0;
    if (n === 0) only++;
    else count.set(ch, n - 1);
  }
  return only;
}

// long의 글자에서 short의 글자를 빼고 남은 것이 long의 단어 몇 개와 정확히 같으면 그 단어를 돌려준다.
// 어순이 바뀌어도 잡힌다. 남은 단어가 브랜드(흑닭·허닭)면 OEM, 재료(야채·곤약)면 다른 상품 → 둘 다 묶지 않는다.
// short 쪽에 남는 글자가 있거나, 남은 글자가 단어 일부("소불고기볶음밥a"의 a)면 해당 없음.
function wholeExtraWords(long: NormalizedRecord, short: NormalizedRecord): string | null {
  const count = new Map<string, number>();
  for (const ch of stripCompany(long.name.key, long)) count.set(ch, (count.get(ch) ?? 0) + 1);
  for (const ch of stripCompany(short.name.key, short)) {
    const n = count.get(ch) ?? 0;
    if (n === 0) return null;
    count.set(ch, n - 1);
  }
  const left = [...count.values()].reduce((x, y) => x + y, 0);
  if (left < 2) return null;
  // 남은 글자를 정확히 채우는 단어 조합을 찾는다 (단어 수가 적어 앞에서부터 욕심내어 고르면 충분)
  const words = long.name.display.split(" ").map(squash).filter(Boolean);
  const picked: string[] = [];
  const pool = new Map(count);
  for (const w of words) {
    const need = new Map<string, number>();
    for (const ch of w) need.set(ch, (need.get(ch) ?? 0) + 1);
    if ([...need].every(([ch, n]) => (pool.get(ch) ?? 0) >= n)) {
      for (const [ch, n] of need) pool.set(ch, pool.get(ch)! - n);
      picked.push(w);
    }
  }
  return [...pool.values()].every((n) => n === 0) ? picked.join(" ") : null;
}

// 이름 속 숫자: 400kcal ↔ 500, 세트 5-53 ↔ 5-46 은 다른 상품 (중량은 정제 때 이미 뺐다)
const numbersOf = (key: string) => (key.match(/\d+/g) ?? []).join(",");

// 이름 앞에 붙은 회사 이름("엄지식품" → "엄지식품", "엄지")을 뗀다
const COMPANY_SUFFIX = /(식품|푸드|에프앤비|f&b|산업|유통|농산|푸즈|foods?)$/;
function stripCompany(key: string, r: NormalizedRecord): string {
  const root = r.company.root.replace(/\s/g, "");
  for (const p of [root, root.replace(COMPANY_SUFFIX, "")]) {
    if (p.length >= 2 && key.startsWith(p) && key.length > p.length) return key.slice(p.length);
  }
  return key;
}

// 규칙 구간: 확실한 것만 규칙으로 끝낸다.
// 같은 공장은 맛만 바꾼 상품이 많아 "이름이 비슷함"만으로는 묶지 않는다.
// 애매 구간 기준값은 정답셋(labels)으로 다시 정한다.
export const AMBIGUOUS = { name: 0.6, materials: 0.6 };
export type Band = "merge" | "ambiguous" | "separate";
export function bandOf(s: PairScore): Band {
  if (s.conflict) return "separate";
  if (s.name === 1 || s.sameAfterCompany) return "merge";
  if (s.name >= AMBIGUOUS.name && s.materials >= AMBIGUOUS.materials) return "ambiguous";
  return "separate";
}
