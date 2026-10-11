-- Build mode, step 4 (BUILD-MODE.md): room positions can be tenths of a metre so new rooms sit flush against the original flat. Safe to re-run. Then `npm run db:generate`.
ALTER TABLE "HomeRoom" ALTER COLUMN "x" TYPE DOUBLE PRECISION, ALTER COLUMN "z" TYPE DOUBLE PRECISION, ALTER COLUMN "w" TYPE DOUBLE PRECISION, ALTER COLUMN "d" TYPE DOUBLE PRECISION;
