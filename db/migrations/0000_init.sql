CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "candidate_pairs" (
	"a" text NOT NULL,
	"b" text NOT NULL,
	"name_sim" real NOT NULL,
	"material_sim" real NOT NULL,
	"same_type" boolean NOT NULL,
	"conflict" text,
	"band" text NOT NULL,
	CONSTRAINT "candidate_pairs_a_b_pk" PRIMARY KEY("a","b")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"query" text,
	"group_id" text,
	"result_count" integer,
	"rank" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_links" (
	"group_a" text NOT NULL,
	"group_b" text NOT NULL,
	"relation" text NOT NULL,
	"probability" real NOT NULL,
	CONSTRAINT "group_links_group_a_group_b_pk" PRIMARY KEY("group_a","group_b")
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"a" text NOT NULL,
	"b" text NOT NULL,
	"truth" text NOT NULL,
	"note" text,
	"labeler" text NOT NULL,
	CONSTRAINT "labels_a_b_pk" PRIMARY KEY("a","b")
);
--> statement-breakpoint
CREATE TABLE "pair_judgments" (
	"a" text NOT NULL,
	"b" text NOT NULL,
	"source" text NOT NULL,
	"relation" text NOT NULL,
	"probabilities" jsonb,
	"confidence" real,
	"model" text,
	"input_tokens" integer,
	"judged_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pair_judgments_a_b_source_pk" PRIMARY KEY("a","b","source")
);
--> statement-breakpoint
CREATE TABLE "product_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"representative_id" text NOT NULL,
	"display_name" text NOT NULL,
	"company_root" text NOT NULL,
	"food_type" text NOT NULL,
	"category" text NOT NULL,
	"member_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"report_no" text PRIMARY KEY NOT NULL,
	"product_name" text NOT NULL,
	"company_name" text NOT NULL,
	"license_no" text NOT NULL,
	"food_type" text NOT NULL,
	"reported_at" text NOT NULL,
	"changed_at" text,
	"raw_materials" text,
	"raw" jsonb NOT NULL,
	"category" text NOT NULL,
	"name_key" text NOT NULL,
	"name_display" text NOT NULL,
	"company_root" text NOT NULL,
	"normalized" jsonb NOT NULL,
	"group_id" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_type_time_idx" ON "events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "groups_name_trgm_idx" ON "product_groups" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "records_group_idx" ON "records" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "records_company_idx" ON "records" USING btree ("company_root");--> statement-breakpoint
ALTER TABLE "records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_groups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "group_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "candidate_pairs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pair_judgments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "labels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
