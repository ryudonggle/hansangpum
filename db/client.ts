import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

// 로컬 스크립트는 .env를 직접 읽고, Next.js·Vercel은 환경 변수로 받는다
try { process.loadEnvFile(".env"); } catch {}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL이 없습니다");
const URL = process.env.DATABASE_URL;

// Supabase Transaction pooler(6543)는 prepared statement를 지원하지 않는다
const open = (max: number) => postgres(URL, { prepare: false, max, connect_timeout: 10 });

// 스크립트(적재·평가)용: 연결 하나를 계속 쓴다
export const client = open(4);
export const db = drizzle(client, { schema });

// 웹(Vercel 함수)용: 함수는 요청이 없으면 얼려지고, 그동안 DB 연결이 끊겨도 클라이언트는 모른다.
// 얼었다 깨어난 뒤 끊긴 연결로 쿼리를 보내면 TCP 시간 초과까지 멈춘다(운영에서 75초 멈춤 확인).
// 그래서 마지막 사용 뒤 IDLE_MS가 지났으면 쿼리 전에 연결을 버리고 새로 연다 (새 연결 약 70ms).
// 연결은 4개까지: 1개로 묶으면 동시에 보낸 쿼리가 한 연결에 겹쳐(pipelining) Transaction pooler에서 멈췄다.
const IDLE_MS = 10_000;
const g = globalThis as unknown as { __web?: { sql: ReturnType<typeof postgres>; last: number } };
function fresh(force = false) {
  const now = Date.now();
  if (force || !g.__web || now - g.__web.last > IDLE_MS) {
    // 이전 연결은 바로 끊지 않는다: 같은 함수가 동시에 처리 중인 다른 요청의 쿼리가 끝날 때까지 최대 5초 기다린다
    g.__web?.sql.end({ timeout: 5 }).catch(() => {});
    g.__web = { sql: open(4), last: now };
  }
  g.__web.last = now;
  return g.__web.sql;
}

// 연결이 끊겨 실패한 쿼리는 새 연결로 한 번만 다시 시도한다 (SQL 오류는 다시 시도하지 않음)
const RETRYABLE = new Set(["CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED", "CONNECT_TIMEOUT", "ECONNRESET", "EPIPE", "ETIMEDOUT"]);
type Tag = (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
export const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
  try {
    return await (fresh() as unknown as Tag)(strings, ...values);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (!RETRYABLE.has(code)) throw e;
    console.error(`DB 연결 오류(${code}), 새 연결로 다시 시도`);
    return await (fresh(true) as unknown as Tag)(strings, ...values);
  }
}) as unknown as ReturnType<typeof postgres>;
