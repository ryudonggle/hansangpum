import { describe, expect, it } from "vitest";
import { normalizeCompany, normalizeName, parseRawMaterials, sameCompanyFamily } from "./normalize.ts";

describe("normalizeName", () => {
  it("띄어쓰기가 달라도 같은 key", () => {
    expect(normalizeName("닭가슴살 샐러드").key).toBe(normalizeName("닭가슴살샐러드").key);
  });

  it("중량은 떼어서 따로 둔다", () => {
    const n = normalizeName("210g 닭가슴살볶음밥");
    expect(n.key).toBe("닭가슴살볶음밥");
    expect(n.weight).toBe("210g");
    expect(normalizeName("OK!COOK 닭가슴살 샐러드 100g").key).toBe("okcook닭가슴살샐러드");
  });

  it("괄호 속 판매처·용량을 뗀다", () => {
    const n = normalizeName("곤약닭가슴살볶음밥(샛별푸드)3KG");
    expect(n.key).toBe("곤약닭가슴살볶음밥");
    expect(n.channel).toBe("샛별푸드");
    expect(n.weight).toBe("3kg");
  });

  it("보관 방식은 이름에서 빼고 따로 기록", () => {
    const a = normalizeName("닭가슴살 치즈 어묵볼 (냉동)");
    const b = normalizeName("닭가슴살 치즈 어묵볼 (냉장)");
    expect(a.key).toBe(b.key);
    expect([a.storage, b.storage]).toEqual(["냉동", "냉장"]);
  });

  it("괄호 없이 뒤에 붙은 보관 표기도 뗀다", () => {
    const n = normalizeName("닭가슴살 메추리장 냉동");
    expect([n.key, n.storage]).toEqual(["닭가슴살메추리장", "냉동"]);
  });

  it("맛은 다른 상품이므로 이름에 남긴다", () => {
    expect(normalizeName("검은콩 찢은 닭가슴살(바베큐맛)").key).toBe("검은콩찢은닭가슴살바베큐맛");
  });

  it("대괄호 브랜드를 뽑는다", () => {
    const n = normalizeName("[미스터]닭가슴살샐러드");
    expect(n.brand).toBe("미스터");
    expect(n.display).toBe("닭가슴살샐러드");
    expect(n.key).not.toBe(normalizeName("[오투]닭가슴살샐러드").key);
  });

  it("입수와 상태 표기", () => {
    expect(normalizeName("닭가슴살 소시지 (3입)").pack).toBe("3입");
    expect(normalizeName("닭가슴살당근라페김밥(미절단,오이X)").state).toBe("미절단,오이x");
    expect(normalizeName("곡물 닭가슴살영양죽(레토르트식품)").key).toBe("곡물닭가슴살영양죽");
  });

  it("라면 포장 형태를 뽑는다", () => {
    expect(normalizeName("the미식 오징어라면 컵").format).toBe("컵");
    expect(normalizeName("큰컵 삼양라면 콰트로치즈").format).toBe("큰컵");
    expect(normalizeName("신라면툼바큰사발면").format).toBe("큰사발");
    expect(normalizeName("신라면").format).toBe("");
    expect(normalizeName("요거트 컵케이크").format).toBe("");
  });

  it("수출용 표기를 뽑는다", () => {
    expect(normalizeName("진라면(미국용)").market).toBe("미국용");
    expect(normalizeName("불닭볶음면 일본수출용").market).toBe("일본수출용");
  });

  it("이유식 단계", () => {
    expect(normalizeName("닭고기케일느타리된죽").stage).toBe("된죽");
    expect(normalizeName("닭가슴살볶음밥").stage).toBe("");
  });

  it("이름 앞 영문 라인 코드를 뗀다", () => {
    expect(normalizeName("SB 닭가슴살버섯묽은죽").key).toBe(normalizeName("닭가슴살버섯묽은죽").key);
    expect(normalizeName("S닭가슴살파프리카묽은죽").code).toBe("s");
    expect(normalizeName("OK!COOK 닭가슴살 샐러드").code).toBeNull();
    expect(normalizeName("the미식 오징어라면").code).toBeNull();
  });

  it("단어 안의 x는 지우지 않는다", () => {
    expect(normalizeName("치킨 box").key).toBe("치킨box");
  });
});

describe("normalizeCompany", () => {
  it.each([
    ["(주)하림산업 함열식품1공장", "하림산업"],
    ["(주)하림 제2공장", "하림"],
    ["주식회사 팜스팜 농업회사법인", "팜스팜"],
    ["농업회사법인모던밀(주)", "모던밀"],
    ["이푸드(주)2공장", "이푸드"],
    ["주)짱죽", "짱죽"],
    ["주식회사 이프리(샐러드유)", "이프리"],
    ["삼성웰스토리 Central Kitchen 아산", "삼성웰스토리"],
    ["(주)두손푸드 칠보지점", "두손푸드"],
  ])("%s → %s", (raw, root) => {
    expect(normalizeCompany(raw).root).toBe(root);
  });

  it("공장 이름은 site로 남긴다", () => {
    expect(normalizeCompany("(주)하림 제2공장").site).toBe("제2공장");
  });

  it("하림 ⊂ 하림산업은 같은 계열, 하늘재와 하림은 아님", () => {
    expect(sameCompanyFamily(normalizeCompany("(주)하림"), normalizeCompany("(주)하림산업 함열식품1공장"))).toBe(true);
    expect(sameCompanyFamily(normalizeCompany("(주)하림"), normalizeCompany("(주)하늘재"))).toBe(false);
  });
});

describe("parseRawMaterials", () => {
  it("괄호 속 쉼표는 나누지 않고 ORDNO 순서로 정렬", () => {
    expect(parseRawMaterials("쌀, 닭가슴살, 옥수수기름(옥배유, 대두유)", "2,1,3")).toEqual(["닭가슴살", "쌀", "옥수수기름"]);
  });
  it("개수가 안 맞으면 원래 순서", () => {
    expect(parseRawMaterials("쌀, 닭가슴살", "1")).toEqual(["쌀", "닭가슴살"]);
  });
});
