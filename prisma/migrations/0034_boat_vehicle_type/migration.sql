-- Step 4: add boat support without changing existing vehicle records.
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'BOAT';
