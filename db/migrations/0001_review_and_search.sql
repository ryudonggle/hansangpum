CREATE TABLE "review_items" (
	"a" text NOT NULL,
	"b" text NOT NULL,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"jev_same" real,
	"decision" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "review_items_a_b_pk" PRIMARY KEY("a","b")
);
--> statement-breakpoint
CREATE INDEX "review_pending_idx" ON "review_items" USING btree ("category","decision");--> statement-breakpoint
CREATE INDEX "records_name_trgm_idx" ON "records" USING gin ("product_name" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "review_items" ENABLE ROW LEVEL SECURITY;
