-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consentTimestamp" TIMESTAMP(3),
ADD COLUMN     "consentVersion" TEXT;
