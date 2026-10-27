import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "./nav.tsx";

const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "한상품 — 신고는 여럿, 상품은 하나",
  description: "식품안전나라 품목제조보고 레코드를 소비자 상품 단위로 묶어 찾는 검색",
};

// 표시: 세 줄(신고)이 한 줄(상품)로 모인다
function Mark() {
  return (
    <svg className="brand-mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 4h6l4 6M2 10h10M2 16h6l4-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 10h6" stroke="#1d5fbf" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={mono.variable}>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>
        <header className="bar">
          <a className="brand" href="/"><Mark />한상품</a>
          <Nav />
          <span className="scope">닭가슴살 품목제조보고 · 식품안전나라</span>
        </header>
        {children}
        <footer className="foot">
          자료: 식품의약품안전처 식품안전나라 품목제조보고(C002). 원본 레코드는 고치지 않고, 묶음은 그 위에 얹은 결과입니다.
          포트폴리오용 시험 서비스이며, 묶음은 자동 판정이라 틀릴 수 있어 실제 상품 정보와 다를 수 있습니다.
          판매처 링크는 쿠팡 검색 결과로 연결됩니다.
        </footer>
      </body>
    </html>
  );
}
