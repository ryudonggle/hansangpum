// 애매한 쌍을 Jev(TypeSafe System One)에게 묻는다.
// 판정 기준(criteria)은 우리가 정하고, Jev는 각 선택지의 확률만 돌려준다.
import type { NormalizedRecord } from "./normalize.ts";
import type { PairScore } from "./score.ts";

export const RELATIONS = {
  same_product: {
    covers: "소비자에게 같은 상품: 브랜드·맛·주재료·구성이 같고, 재신고·공장 이전·띄어쓰기·용량·포장 표기만 다르다",
    examples: ["닭가슴살 소불고기 볶음밥 ↔ 닭가슴살 소불고기볶음밥a (같은 공장, 원재료 동일)"],
  },
  oem_sibling: {
    covers: "같은 공장이 같은 레시피로 만들지만 서로 다른 브랜드 이름으로 파는 상품 (OEM). 원재료는 거의 같고 이름 앞 브랜드만 다르다",
    examples: ["마니커 닭가슴살 야채볶음밥 ↔ 담백가득 닭가슴살 야채볶음밥"],
  },
  different_product: {
    covers: "맛·주재료·구성·용도·이유식 단계(미음·죽·진밥·무른밥 등)가 다른 별개 상품",
    examples: ["닭가슴살 김치볶음밥 ↔ 닭가슴살 야채볶음밥", "닭고기가지진밥 ↔ 닭고기가지무른밥"],
  },
} as const;
export type Relation = keyof typeof RELATIONS;

// Jev 확률 기준 (정답셋으로 정함, scripts/eval/round1-evaluate.ts)
export const SAME_MIN = 0.7; // 이 이상이면 자동으로 묶는다
export const REVIEW_MIN = 0.35; // 이 사이면 사람이 /admin에서 본다
// 한쪽에 이 글자 수 이상 더 붙은 쌍(바게트샌드↔샌드, 마라꿔바로우↔꿔바로우)은 Jev가 높은 확신으로 틀리는 일이 많아
// 점수가 높아도 자동으로 묶지 않고 검수로 보낸다 (정답셋 2차에서 확인)
export const AUTO_MAX_EXTRA_CHARS = 1;

const side = (r: NormalizedRecord, rawName: string) => ({
  상품명: rawName,
  정제이름: r.name.display,
  브랜드: r.name.brand,
  업체: r.company.root,
  공장: r.company.site,
  식품유형: r.type,
  원재료: r.materials.slice(0, 15),
});

export function buildRequest(a: NormalizedRecord, b: NormalizedRecord, names: [string, string], score: PairScore) {
  return {
    model: "jev-latest",
    state: {
      설명: "식품안전나라 품목제조보고 레코드 두 건. 같은 회사 계열이 신고했다.",
      a: side(a, names[0]),
      b: side(b, names[1]),
      같은_인허가번호: score.sameSite,
      원재료_겹침: Math.round(score.materials * 100) / 100,
    },
    questions: {
      relation: {
        type: "choice",
        instructions: "레코드 `a`와 `b`는 쇼핑몰에서 소비자가 보기에 어떤 관계인가?",
        criteria: RELATIONS,
      },
    },
  };
}

export type Judgment = {
  relation: Relation;
  probabilities: Record<Relation, number>;
  confidence: number;
  model: string;
  inputTokens: number;
};

export async function judge(body: ReturnType<typeof buildRequest>, key: string): Promise<Judgment> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const json = await res.json();
      const ans = json.answers.relation;
      return { relation: ans.choice, probabilities: ans.probabilities, confidence: ans.confidence, model: json.model, inputTokens: json.usage.input_tokens };
    }
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}
