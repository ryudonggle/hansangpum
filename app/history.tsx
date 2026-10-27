// 신고 이력 줄: 한 묶음의 신고가 언제 들어왔는지 같은 연도 축 위에 점으로 찍는다.
// 대표(가장 최근 신고)만 데이터 색. 모든 결과가 같은 축을 써서 묶음끼리 비교된다.
const FROM = 2012;
const TO = 2027;
const W = 132;
const H = 18;
const x = (yyyymmdd: string) => {
  const y = Number(yyyymmdd.slice(0, 4)) + (Number(yyyymmdd.slice(4, 6)) - 1) / 12;
  return 4 + ((Math.min(Math.max(y, FROM), TO) - FROM) / (TO - FROM)) * (W - 8);
};

export function History({ dates, size = "row" }: { dates: string[]; size?: "row" | "large" }) {
  const large = size === "large";
  const scale = large ? 2.6 : 1;
  const h = large ? H + 6 : H; // 큰 줄은 아래에 연도 글자
  const last = dates.length - 1;
  return (
    <svg className="history" width={W * scale} height={h * scale} viewBox={`0 0 ${W} ${h}`} role="img"
      aria-label={`신고 ${dates.length}건: ${dates.map((d) => d.slice(0, 4)).join(", ")}년`}>
      <line x1="4" x2={W - 4} y1="9" y2="9" className="history-axis" />
      {[2015, 2020, 2025].map((y) => (
        <line key={y} x1={x(`${y}01`)} x2={x(`${y}01`)} y1="6" y2="12" className="history-tick" />
      ))}
      {large && [2015, 2020, 2025].map((y) => (
        <text key={y} x={x(`${y}01`)} y={H + 4} textAnchor="middle" className="history-year">{y}</text>
      ))}
      {dates.map((d, i) => (
        <circle key={i} cx={x(d)} cy="9" r={i === last ? 3.2 : 2.6} className={i === last ? "history-rep" : "history-dot"} />
      ))}
    </svg>
  );
}

export const HISTORY_YEARS = [2015, 2020, 2025];
