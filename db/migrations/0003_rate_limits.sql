CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window" integer NOT NULL,
	"hits" integer NOT NULL,
	CONSTRAINT "rate_limits_key_window_pk" PRIMARY KEY("key","window")
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;