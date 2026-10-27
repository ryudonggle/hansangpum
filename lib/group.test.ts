import { describe, expect, it } from "vitest";
import { buildGroups } from "./group.ts";

describe("buildGroups", () => {
  it("A=B, B=C면 한 묶음, D는 혼자", () => {
    const g = buildGroups(["a", "b", "c", "d"], [{ a: "a", b: "b" }, { a: "c", b: "b" }]);
    expect([...g.values()].map((v) => v.sort())).toEqual([["a", "b", "c"], ["d"]]);
  });
  it("다른 상품으로 판정된 쌍은 연쇄로도 섞이지 않는다", () => {
    const g = buildGroups(["a", "b", "c"], [{ a: "a", b: "b" }, { a: "b", b: "c" }], [{ a: "a", b: "c" }]);
    expect([...g.values()].map((v) => v.sort())).toEqual([["a", "b"], ["c"]]);
  });
  it("대표 id는 간선 순서와 상관없이 같다", () => {
    const x = buildGroups(["a", "b", "c"], [{ a: "c", b: "b" }, { a: "b", b: "a" }]);
    const y = buildGroups(["a", "b", "c"], [{ a: "a", b: "b" }, { a: "b", b: "c" }]);
    expect([...x.keys()]).toEqual([...y.keys()]);
  });
});

describe("묶음 다수결", () => {
  it("쌍 하나만 같고 나머지가 다르면 두 묶음을 합치지 않는다", () => {
    // {a,b}는 같음, {c}는 a와 다름·b와 같음 → 표 0 → 합치지 않음
    const votes = new Map([["a|b", 1], ["b|c", 1], ["a|c", -1]]);
    const g = buildGroups(["a", "b", "c"], [{ a: "a", b: "b" }, { a: "b", b: "c" }], [], votes);
    expect([...g.values()].map((v) => v.sort())).toEqual([["a", "b"], ["c"]]);
  });
  it("사이 쌍 대부분이 같으면 합친다", () => {
    const votes = new Map([["a|b", 1], ["b|c", 1], ["a|c", 1]]);
    const g = buildGroups(["a", "b", "c"], [{ a: "a", b: "b" }, { a: "b", b: "c" }], [], votes);
    expect(g.size).toBe(1);
  });
});
