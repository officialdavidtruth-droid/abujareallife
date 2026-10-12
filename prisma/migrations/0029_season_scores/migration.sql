-- Seasonal leaderboards. Safe to re-run.
CREATE TABLE IF NOT EXISTS "SeasonScore" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "season" INTEGER NOT NULL,
  "board" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SeasonScore_userId_season_board_key" ON "SeasonScore"("userId","season","board");
CREATE INDEX IF NOT EXISTS "SeasonScore_season_board_score_idx" ON "SeasonScore"("season","board","score");