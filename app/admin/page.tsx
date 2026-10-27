import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, DECISIONS, dailyEvents, isAdmin, reviewQueue, topQueries, type DayRow } from "../../lib/web/admin.ts";
import { overview } from "../../lib/web/queries.ts";
import { QUALITY } from "../../lib/quality.ts";
import { decideAction, logout } from "./actions.ts";
import { date, n } from "../format.ts";

export const dynamic = "force-dynamic";

const METRICS: { key: keyof Omit<DayRow, "day">; label: string; note: string }[] = [
  { key: "searches", label: "검색", note: "검색어를 넣은 횟수" },
  { key: "zero", label: "결과 0건 검색", note: "찾는 상품이 없던 검색" },
  { key: "clicks", label: "결과 클릭", note: "검색 결과에서 상품을 연 횟수" },
  { key: "outbound", label: "쿠팡 이동", note: "상세에서 판매처로 나간 횟수" },
];

export default async function Admin({ searchParams }: { searchParams: Promise<{ metric?: string }> }) {
  if (!isAdmin((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/admin/login");
  const { metric } = await searchParams;
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0];
  const [days, queue, queries, o] = await Promise.all([dailyEvents(), reviewQueue(), topQueries(), overview()]);
  const total = (k: keyof Omit<DayRow, "day">) => days.reduce((s, d) => s + d[k], 0);
  const searches = total("searches");
  const zero = total("zero");

  return (
    <main className="stack">
      <div className="title-row">
        <div>
          <h1>검수·지표</h1>
          <p className="lede">
            검수 대기 {n(queue.pending)}쌍 · 최근 14일 검색 {n(searches)}회
            {searches > 0 ? `, 그중 결과 0건 ${n(zero)}회 (${((zero / searches) * 100).toFixed(1)}%)` : ", 아직 기록된 검색이 없습니다"}
          </p>
        </div>
        <form action={logout}><button className="button button-secondary" type="submit">나가기</button></form>
      </div>

      <section className="card" aria-labelledby="usage">
        <h2 id="usage" className="visually-hidden">최근 14일 사용</h2>
        <nav className="tabs" aria-label="지표">
          {METRICS.map((x) => (
            <Link key={x.key} className="tab" href={`/admin?metric=${x.key}`} aria-current={x.key === m.key}>
              <div className="strip-label">{x.label}</div>
              <div className="strip-value num">{n(total(x.key))}</div>
            </Link>
          ))}
        </nav>
        <div className="chart">
          <Bars days={days} metric={m.key} />
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>{m.note} · 하루 단위(한국 시간), 파란 막대가 오늘</p>
        </div>
      </section>

      <div className="grid-6">
        <section className="card span-4" aria-labelledby="review">
          <div className="card-head">
            <h2 id="review">검수 대기</h2>
            <span className="muted num">{n(queue.pending)}쌍 남음 · {n(queue.decided)}쌍 결정 · Jev 확률 높은 순</span>
          </div>
          {queue.rows.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>두 신고</th><th>이유</th><th className="num">Jev 같음</th><th className="num">원재료 겹침</th><th className="num">결정</th></tr></thead>
                <tbody>
                  {queue.rows.map((r) => (
                    <tr key={`${r.a}|${r.b}`}>
                      <td>
                        <div>{r.aName} <span className="muted num">{date(r.aDate)}</span></div>
                        <div>{r.bName} <span className="muted num">{date(r.bDate)}</span></div>
                        <div className="muted" style={{ fontSize: 12 }}>{r.company}</div>
                      </td>
                      <td><span className="pill pill-warning">{r.reason}</span></td>
                      <td className="num">{r.jevSame === null ? "—" : r.jevSame.toFixed(2)}</td>
                      <td className="num">{r.materialSim === null ? "—" : `${Math.round(r.materialSim * 100)}%`}</td>
                      <td>
                        <form action={decideAction} className="decide">
                          <input type="hidden" name="a" value={r.a} /><input type="hidden" name="b" value={r.b} />
                          {DECISIONS.map((d) => (
                            <button key={d} className={`button ${d === "같음" ? "button-primary" : "button-outline"}`} name="decision" value={d} type="submit">{d}</button>
                          ))}
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">검수할 쌍이 없습니다.</p>
          )}
          <div className="list-foot">고른 결정은 판정 캐시(pair_judgments, 사람)에 저장되고 다음 묶기 실행 때 반영됩니다.</div>
        </section>

        <section className="card span-2" aria-labelledby="queries">
          <div className="card-head"><h2 id="queries">많이 찾은 검색어</h2><span className="muted">최근 14일</span></div>
          {queries.length ? (
            <table>
              <thead><tr><th>검색어</th><th className="num">검색</th><th className="num">클릭</th></tr></thead>
              <tbody>
                {queries.map((q) => (
                  <tr key={q.query}>
                    <td>{q.query}{q.min_results === 0 && <span className="pill pill-warning" style={{ marginLeft: 6 }}>결과 0건</span>}</td>
                    <td className="num">{n(q.n)}</td>
                    <td className="num">{n(q.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">아직 검색 기록이 없습니다. 검색 화면에서 찾으면 여기에 쌓입니다.</p>
          )}
        </section>

        <section className="card span-6" aria-labelledby="quality">
          <div className="card-head">
            <h2 id="quality">묶음 품질</h2>
            <span className="muted">최종 시험 {n(QUALITY.sample)}쌍 · {QUALITY.measuredAt} · 라벨 {QUALITY.labeler} · 규칙 동결 후 1회 측정</span>
          </div>
          <div className="strip">
            <div><div className="strip-label">정밀도</div><div className="strip-value num">{QUALITY.precision.toFixed(1)}%</div><div className="strip-note">자동으로 묶은 쌍 중 같은 상품 · 하한 {QUALITY.precisionLow}%</div></div>
            <div><div className="strip-label">재현율</div><div className="strip-value num">{QUALITY.recall.toFixed(1)}%</div><div className="strip-note">같은 상품 쌍 중 자동으로 묶은 것</div></div>
            <div><div className="strip-label">검수 포함 재현율</div><div className="strip-value num">{QUALITY.recallWithReview.toFixed(1)}%</div><div className="strip-note">못 묶은 같은 상품이 모두 검수 대기에 있음</div></div>
            <div><div className="strip-label">레코드 → 상품</div><div className="strip-value num">{n(o.records)} → {n(o.groups)}</div><div className="strip-note">{((1 - o.groups / o.records) * 100).toFixed(1)}% 줄었습니다</div></div>
          </div>
        </section>
      </div>
    </main>
  );
}

// 14일 막대: y축 눈금 4개, 오늘만 데이터 색
function Bars({ days, metric }: { days: DayRow[]; metric: keyof Omit<DayRow, "day"> }) {
  const W = 1040, H = 200, L = 32, B = 22, T = 8;
  const values = days.map((d) => d[metric]);
  const top = Math.max(4, Math.ceil(Math.max(...values) / 4) * 4);
  const ticks = [0, 1, 2, 3, 4].map((i) => (top / 4) * i);
  const y = (v: number) => H - B - ((H - B - T) * v) / top;
  const step = (W - L) / days.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 14일 ${days.map((d) => `${d.day} ${d[metric]}`).join(", ")}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={L} x2={W} y1={y(t)} y2={y(t)} />
          <text className="tick" x={L - 8} y={y(t) + 4} textAnchor="end">{n(t)}</text>
        </g>
      ))}
      {days.map((d, i) => (
        <g key={d.day}>
          <rect className={i === days.length - 1 ? "col-now" : "col"} x={L + i * step + step * 0.25} width={step * 0.5} y={y(d[metric])} height={Math.max(0, H - B - y(d[metric]))} />
          {i % 2 === 1 && <text className="tick" x={L + i * step + step / 2} y={H - 6} textAnchor="middle">{d.day}</text>}
        </g>
      ))}
    </svg>
  );
}
