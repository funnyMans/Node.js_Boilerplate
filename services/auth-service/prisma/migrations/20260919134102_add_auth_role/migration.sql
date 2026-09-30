-- CreateEnum
CREATE TYPE "AuthRole" AS ENUM ('user', 'admin');

-- AlterTable
ALTER TABLE "Credential" ADD COLUMN     "role" "AuthRole" NOT NULL DEFAULT 'user';
