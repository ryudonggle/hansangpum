import { describe, expect, it } from "vitest";
import { normalizeRecord, type RawRecord } from "./normalize.ts";
import { bandOf, bigramDice, jaccard, scorePair } from "./score.ts";

const rec = (PRDLST_NM: string, BSSH_NM = "주식회사 엄지식품", RAWMTRL_NM = "닭가슴살, 쌀, 양파", extra: Partial<RawRecord> = {}) =>
  normalizeRecord({ PRDLST_REPORT_NO: PRDLST_NM + BSSH_NM, PRDLST_NM, BSSH_NM, LCNS_NO: "1", PRDLST_DCNM: "즉석조리식품", PRMS_DT: "20240101", RAWMTRL_NM, ...extra });

describe("유사도", () => {
  it("bigram은 띄어쓰기 차이에 강하다", () => {
    expect(bigramDice("닭가슴살볶음밥", "닭가슴살볶음밥")).toBe(1);
    expect(bigramDice("닭가슴살볶음밥", "닭가슴살김치볶음밥")).toBeGreaterThan(0.7);
  });
  it("jaccard", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
  });
});

describe("규칙 구간", () => {
  it("이름이 같으면 묶는다 (재신고)", () => {
    expect(bandOf(scorePair(rec("닭가슴살볶음밥"), rec("닭가슴살 볶음밥")))).toBe("merge");
  });
  it("회사 이름 접두어만 다르면 묶는다", () => {
    expect(bandOf(scorePair(rec("닭가슴살볶음밥"), rec("엄지 닭가슴살볶음밥")))).toBe("merge");
  });
  it("회사가 다르면 이름이 같아도 따로", () => {
    expect(bandOf(scorePair(rec("닭가슴살 샐러드", "(주)담푸른"), rec("닭가슴살 샐러드", "(주)하늘재")))).toBe("separate");
  });
  it("보관 방식이 다르면 따로", () => {
    expect(bandOf(scorePair(rec("닭가슴살미음(실온)"), rec("닭가슴살미음(냉동)")))).toBe("separate");
  });
  it("이유식 단계가 다르면 따로 (된죽 ≠ 죽)", () => {
    expect(bandOf(scorePair(rec("닭고기케일느타리된죽"), rec("닭고기케일느타리죽")))).toBe("separate");
    expect(bandOf(scorePair(rec("닭가슴살볶음밥"), rec("닭가슴살 볶음밥")))).toBe("merge");
  });
  it("이름 속 숫자가 다르면 따로", () => {
    expect(bandOf(scorePair(rec("메디쏠라 닭가슴살치즈덮밥 400"), rec("메디쏠라 닭가슴살치즈덮밥 500")))).toBe("separate");
  });
  it("양쪽에 서로 다른 글자가 있으면 따로 (맛·종류·브랜드 바뀜)", () => {
    expect(scorePair(rec("창규가 빚은 건강함 닭가슴살 부추군만두"), rec("창규가 빚은 건강함 닭가슴살 부추물만두")).conflict).toBe("양쪽에 서로 다른 글자가 있음");
    expect(scorePair(rec("간편한 닭가슴살 야채볶음밥"), rec("담백가득 닭가슴살 야채볶음밥")).conflict).toBe("양쪽에 서로 다른 글자가 있음");
    expect(scorePair(rec("곤약닭가슴살볶음밥"), rec("닭가슴살 곤약 볶음밥")).conflict).toBeNull();
  });
  it("한쪽에만 단어가 통째로 더 있으면 따로 (브랜드·재료)", () => {
    const s = scorePair(rec("허닭 닭가슴살 야채곤약볶음밥"), rec("닭가슴살 야채 곤약 볶음밥"));
    expect(s.extraWords).toBe("허닭");
    expect(bandOf(s)).toBe("separate");
    expect(scorePair(rec("흑닭 소불고기 닭가슴살볶음밥"), rec("닭가슴살 소불고기볶음밥")).extraWords).toBe("흑닭");
    expect(scorePair(rec("닭가슴살 야채 곤약볶음밥"), rec("닭가슴살 곤약볶음밥")).extraWords).toBe("야채");
  });
  it("어순만 바뀌거나 꼬리 한 글자, 회사 이름은 단어 차이로 보지 않는다", () => {
    expect(scorePair(rec("곤약닭가슴살볶음밥"), rec("닭가슴살곤약볶음밥")).extraWords).toBeNull();
    expect(scorePair(rec("닭가슴살 소불고기볶음밥A"), rec("닭가슴살 소불고기볶음밥")).extraWords).toBeNull();
    expect(scorePair(rec("엄지 닭가슴살볶음밥"), rec("닭가슴살볶음밥")).extraWords).toBeNull();
  });
  it("단어 일부만 남으면 해당 없음 (곤약닭가슴살볶음밥 ↔ 닭가슴살볶음밥)", () => {
    expect(scorePair(rec("곤약닭가슴살볶음밥"), rec("닭가슴살볶음밥")).extraWords).toBeNull();
  });
  it("브랜드가 서로 바뀐 쌍은 규칙으로 따로", () => {
    expect(bandOf(scorePair(rec("마니커 닭가슴살 야채볶음밥"), rec("담백가득 닭가슴살 야채볶음밥")))).toBe("separate");
  });
  it("한쪽에만 글자가 조금 더 있으면 Jev에 넘긴다", () => {
    expect(bandOf(scorePair(rec("닭가슴살 리코타 샐러드"), rec("닭가슴살 리코타치즈 샐러드")))).toBe("ambiguous");
  });
  it("이름만 닮고 원재료가 다르면 따로", () => {
    expect(bandOf(scorePair(rec("닭가슴살 김치볶음밥", undefined, "닭가슴살, 김치, 쌀"), rec("닭가슴살 야채볶음밥", undefined, "닭가슴살, 당근, 양배추, 쌀, 파")))).toBe("separate");
  });
});
