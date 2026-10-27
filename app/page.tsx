import Link from "next/link";
import { mostMerged, overview, searchGroups } from "../lib/queries.ts";
import { ResultList } from "./results.tsx";
import { LogOnMount } from "./track.tsx";
import { n } from "./format.ts";

const PAGE = 50;
const EXAMPLES = ["닭가슴살 볶음밥", "하림", "닭곰탕", "묽은죽", "닭가슴살 샐러드"];

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q = "", type } = await searchParams;
  const query = q.trim().slice(0, 50);
  return query ? <Results query={query} type={type} /> : <Start />;
}

function SearchBox({ query = "" }: { query?: string }) {
  return (
    <form className="search" action="/" role="search">
      <label htmlFor="q" className="visually-hidden">상품명 또는 업체명</label>
      <input id="q" name="q" defaultValue={query} placeholder="상품명이나 업체명 (예: 닭가슴살 김치볶음밥)" autoComplete="off" />
      <button className="button button-primary" type="submit">찾기</button>
    </form>
  );
}

async function Start() {
  const [o, top] = await Promise.all([overview(), mostMerged()]);
  const mergedRecords = o.records - o.groups + o.merged; // 여러 신고가 묶인 상품에 들어간 신고 수
  return (
    <main className="stack">
      <div>
        <h1>닭가슴살 상품 검색</h1>
        <p className="lede">
          품목제조보고 {n(o.records)}건을 소비자 상품 {n(o.groups)}개로 묶었습니다. 같은 상품이 공장·재신고로 여러 번 나오지 않습니다.
        </p>
      </div>
      <SearchBox />
      <p className="muted" style={{ margin: 0 }}>
        이런 것을 찾아보세요:{" "}
        {EXAMPLES.map((e, i) => (
          <span key={e}>{i > 0 && " · "}<Link href={`/?q=${encodeURIComponent(e)}`}>{e}</Link></span>
        ))}
      </p>
      <section className="card" aria-labelledby="numbers">
        <h2 id="numbers" className="visually-hidden">묶은 결과</h2>
        <div className="strip">
          <div><div className="strip-label">품목제조보고</div><div className="strip-value num">{n(o.records)}</div><div className="strip-note">식품안전나라 원본 레코드</div></div>
          <div><div className="strip-label">소비자 상품</div><div className="strip-value num">{n(o.groups)}</div><div className="strip-note">레코드 {n(o.records - o.groups)}건이 줄었습니다</div></div>
          <div><div className="strip-label">여러 신고가 묶인 상품</div><div className="strip-value num">{n(o.merged)}</div><div className="strip-note">신고 {n(mergedRecords)}건이 들어 있습니다</div></div>
          <div><div className="strip-label">사람 검수 대기</div><div className="strip-value num">{n(o.pending)}</div><div className="strip-note">자동으로 정하지 않은 쌍</div></div>
        </div>
      </section>
      <section className="card" aria-labelledby="merged">
        <div className="card-head">
          <h2 id="merged">신고가 가장 많이 묶인 상품</h2>
          <span className="muted">점 하나가 신고 한 건, 파란 점이 화면에 보여 주는 최신 신고</span>
        </div>
        <ResultList hits={top} />
      </section>
    </main>
  );
}

async function Results({ query, type }: { query: string; type?: string }) {
  const all = await searchGroups(query);
  const byType = new Map<string, number>();
  for (const h of all) byType.set(h.foodType, (byType.get(h.foodType) ?? 0) + 1);
  const types = [...byType].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const active = type && byType.has(type) ? type : undefined;
  const hits = active ? all.filter((h) => h.foodType === active) : all;
  const shown = hits.slice(0, PAGE);
  const href = (t?: string) => `/?q=${encodeURIComponent(query)}${t ? `&type=${encodeURIComponent(t)}` : ""}`;
  return (
    <main className="stack">
      <LogOnMount type="search" query={query} resultCount={all.length} />
      <div>
        <h1>‘{query}’ 검색 결과</h1>
        <p className="lede">
          {all.length === 0
            ? "맞는 상품이 없습니다. 띄어쓰기를 바꾸거나 더 짧은 이름으로 찾아보세요."
            : `상품 ${n(all.length)}개 · 신고 ${n(all.reduce((s, h) => s + h.memberCount, 0))}건을 상품 단위로 묶어 보여 줍니다`}
        </p>
      </div>
      <SearchBox query={query} />
      {all.length > 0 && (
        <nav className="counts" aria-label="식품 유형">
          <Link className="count" href={href()} aria-current={!active}>
            <span className="count-label">전체</span><span className="count-value num">{n(all.length)}</span>
          </Link>
          {types.map(([t, c]) => (
            <Link key={t} className="count" href={href(t)} aria-current={active === t}>
              <span className="count-label">{t}</span><span className="count-value num">{n(c)}</span>
            </Link>
          ))}
        </nav>
      )}
      {all.length > 0 && (
        <section className="card" aria-labelledby="results">
          <div className="card-head">
            <h2 id="results">{active ?? "전체"} 상품</h2>
            <span className="muted">입력 그대로 포함 → 단어가 모두 포함 → 비슷한 이름 순</span>
          </div>
          <ResultList hits={shown} query={query} />
          {hits.length > shown.length && <div className="list-foot">{n(hits.length)}개 중 {n(shown.length)}개를 보여 줍니다. 검색어를 더 자세히 써 보세요.</div>}
        </section>
      )}
    </main>
  );
}
