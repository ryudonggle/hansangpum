// Supabase Postgres 표 정의 (Drizzle). 원본 레코드는 지우지 않고 쌓으며, 묶음·판정은 그 위에 얹는다.
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, real, serial, text, timestamp } from "drizzle-orm/pg-core";

// 품목제조보고 원본 + 정제 결과
export const records = pgTable(
  "records",
  {
    reportNo: text("report_no").primaryKey(), // PRDLST_REPORT_NO
    productName: text("product_name").notNull(), // PRDLST_NM 원문
    companyName: text("company_name").notNull(), // BSSH_NM 원문
    licenseNo: text("license_no").notNull(),
    foodType: text("food_type").notNull(), // PRDLST_DCNM
    reportedAt: text("reported_at").notNull(), // PRMS_DT (YYYYMMDD)
    changedAt: text("changed_at"), // CHNG_DT: 바뀌면 다시 정제·판정
    rawMaterials: text("raw_materials"),
    raw: jsonb("raw").notNull(), // 받은 그대로
    category: text("category").notNull(), // 수집 묶음 이름 (닭가슴살)
    service: text("service").notNull().default("C002"), // C002 식품 · C006 축산물
    nameKey: text("name_key").notNull(),
    nameDisplay: text("name_display").notNull(),
    companyRoot: text("company_root").notNull(),
    normalized: jsonb("normalized").notNull(), // 브랜드·보관·포장·단계 등 정제 결과 전체
    groupId: text("group_id"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("records_group_idx").on(t.groupId),
    index("records_company_idx").on(t.companyRoot),
    index("records_name_trgm_idx").using("gin", sql`${t.productName} gin_trgm_ops`),
  ],
);

// 소비자 상품 묶음. 대표 = 신고일이 가장 최근인 레코드
export const productGroups = pgTable(
  "product_groups",
  {
    id: text("id").primaryKey(),
    representativeId: text("representative_id").notNull(),
    displayName: text("display_name").notNull(),
    companyRoot: text("company_root").notNull(),
    foodType: text("food_type").notNull(),
    category: text("category").notNull(),
    memberCount: integer("member_count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("groups_name_trgm_idx").using("gin", sql`${t.displayName} gin_trgm_ops`)],
);

// 같은 레시피·다른 브랜드(OEM 형제) 링크
export const groupLinks = pgTable(
  "group_links",
  {
    groupA: text("group_a").notNull(),
    groupB: text("group_b").notNull(),
    relation: text("relation").notNull(), // oem_sibling
    probability: real("probability").notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupA, t.groupB] })],
);

// 후보 쌍과 규칙 점수
export const candidatePairs = pgTable(
  "candidate_pairs",
  {
    a: text("a").notNull(),
    b: text("b").notNull(),
    nameSim: real("name_sim").notNull(),
    materialSim: real("material_sim").notNull(),
    sameType: boolean("same_type").notNull(),
    conflict: text("conflict"),
    band: text("band").notNull(), // merge | ambiguous | separate
  },
  (t) => [primaryKey({ columns: [t.a, t.b] })],
);

// 판정 캐시: Jev·사람 판정. 다시 돌려도 같은 쌍은 재호출하지 않는다
export const pairJudgments = pgTable(
  "pair_judgments",
  {
    a: text("a").notNull(),
    b: text("b").notNull(),
    source: text("source").notNull(), // jev | human
    relation: text("relation").notNull(), // same_product | oem_sibling | different_product
    probabilities: jsonb("probabilities"),
    confidence: real("confidence"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    judgedAt: timestamp("judged_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.a, t.b, t.source] })],
);

// 검수 대기: 자동으로 정하지 않은 쌍. 사람이 /admin에서 같음·OEM·다름을 고른다
export const reviewItems = pgTable(
  "review_items",
  {
    a: text("a").notNull(),
    b: text("b").notNull(),
    category: text("category").notNull(),
    reason: text("reason").notNull(), // Jev 확률이 애매함 | 단어 차이 "허닭"
    jevSame: real("jev_same"), // Jev가 본 같은 상품 확률 (없으면 null)
    decision: text("decision"), // 같음 | OEM | 다름 (null = 대기)
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.a, t.b] }), index("review_pending_idx").on(t.category, t.decision)],
);

// 정답셋
export const labels = pgTable(
  "labels",
  {
    a: text("a").notNull(),
    b: text("b").notNull(),
    truth: text("truth").notNull(), // 같음 | OEM | 다름
    note: text("note"),
    labeler: text("labeler").notNull(),
  },
  (t) => [primaryKey({ columns: [t.a, t.b] })],
);

// 사용자 로그: 검색·클릭·상세 보기·구매 링크
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    type: text("type").notNull(), // search | result_click | product_view | outbound_click
    query: text("query"),
    groupId: text("group_id"),
    resultCount: integer("result_count"),
    rank: integer("rank"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("events_type_time_idx").on(t.type, t.createdAt)],
);

// 요청 횟수 제한: (범위·IP 해시, 시간 칸)마다 센다. Vercel 함수는 여러 개가 따로 떠서 메모리로는 셀 수 없다
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(), // events:<IP 해시> | login:* 등
    window: integer("window").notNull(), // epoch 초 / 칸 길이
    hits: integer("hits").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.window] })],
);
