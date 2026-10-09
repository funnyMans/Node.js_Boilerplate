DELETE FROM "Session";

ALTER TABLE "Credential" DROP COLUMN "role";
DROP TYPE "AuthRole";

CREATE TYPE "AuthRole" AS ENUM (
  'transportation_executive',
  'chief_supervisor',
  'area_supervisor',
  'broker',
  'outer_fleet_broker',
  'fleet_dispatcher',
  'contract_capacity_dispatcher',
  'in_house_driver',
  'contracted_driver',
  'customer_contact',
  'outside_carrier_contact',
  'outer_fleet_supervisor'
);

CREATE TYPE "AuthArea" AS ENUM ('company', 'la', 'west', 'central', 'east');

CREATE TABLE "CredentialRoleGrant" (
  "id" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "role" "AuthRole" NOT NULL,
  "area" "AuthArea" NOT NULL DEFAULT 'company',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CredentialRoleGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CredentialRoleGrant_credentialId_fkey"
    FOREIGN KEY ("credentialId") REFERENCES "Credential"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CredentialRoleGrant_credentialId_role_area_key"
  ON "CredentialRoleGrant"("credentialId", "role", "area");
CREATE INDEX "CredentialRoleGrant_credentialId_idx"
  ON "CredentialRoleGrant"("credentialId");
