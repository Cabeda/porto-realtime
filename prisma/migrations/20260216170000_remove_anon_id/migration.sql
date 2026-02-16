-- DropIndex
DROP INDEX IF EXISTS "User_anonId_key";

-- AlterTable: remove anonId column
ALTER TABLE "User" DROP COLUMN IF EXISTS "anonId";
