-- CreateEnum
CREATE TYPE "LocationPrecision" AS ENUM ('LOCALITY', 'SUBLOCALITY', 'LANDMARK', 'EXACT');

-- CreateEnum
CREATE TYPE "Flexibility" AS ENUM ('HARD', 'MOVEABLE_WITHIN_WINDOW');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_areas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "planning_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "planning_area_id" UUID NOT NULL,
    "centroid_latitude" DECIMAL(9,6) NOT NULL,
    "centroid_longitude" DECIMAL(9,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "label" TEXT,
    "address_text" TEXT NOT NULL,
    "locality_id" UUID,
    "precision" "LocationPrecision" NOT NULL DEFAULT 'EXACT',
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "plus_code" TEXT,
    "landmark_notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "promised_start" SMALLINT NOT NULL,
    "window_start" SMALLINT NOT NULL,
    "window_end" SMALLINT NOT NULL,
    "service_duration_minutes" SMALLINT NOT NULL,
    "flexibility" "Flexibility" NOT NULL DEFAULT 'MOVEABLE_WITHIN_WINDOW',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_legs" (
    "id" UUID NOT NULL,
    "origin_key" TEXT NOT NULL,
    "destination_key" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "distance_metres" INTEGER NOT NULL,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_geometries" (
    "id" UUID NOT NULL,
    "sequence_hash" TEXT NOT NULL,
    "encoded_polyline" TEXT NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_geometries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "depot_latitude" DECIMAL(9,6) NOT NULL,
    "depot_longitude" DECIMAL(9,6) NOT NULL,
    "depot_label" TEXT NOT NULL,
    "workday_start" SMALLINT NOT NULL,
    "workday_end" SMALLINT NOT NULL,
    "default_service_minutes" SMALLINT NOT NULL,
    "access_buffer_minutes" SMALLINT NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "day_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "planning_areas_name_key" ON "planning_areas"("name");

-- CreateIndex
CREATE UNIQUE INDEX "localities_name_key" ON "localities"("name");

-- CreateIndex
CREATE INDEX "localities_planning_area_id_idx" ON "localities"("planning_area_id");

-- CreateIndex
CREATE INDEX "locations_customer_id_idx" ON "locations"("customer_id");

-- CreateIndex
CREATE INDEX "locations_locality_id_idx" ON "locations"("locality_id");

-- CreateIndex
CREATE INDEX "appointments_date_status_idx" ON "appointments"("date", "status");

-- CreateIndex
CREATE INDEX "appointments_customer_id_idx" ON "appointments"("customer_id");

-- CreateIndex
CREATE INDEX "travel_legs_fetched_at_idx" ON "travel_legs"("fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "travel_legs_origin_key_destination_key_key" ON "travel_legs"("origin_key", "destination_key");

-- CreateIndex
CREATE UNIQUE INDEX "route_geometries_sequence_hash_key" ON "route_geometries"("sequence_hash");

-- AddForeignKey
ALTER TABLE "localities" ADD CONSTRAINT "localities_planning_area_id_fkey" FOREIGN KEY ("planning_area_id") REFERENCES "planning_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Rules Prisma's schema language cannot express, added by hand.
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- Value sanity. The application validates all of this too, so users get readable messages;
-- these are the backstop that catches an import script or a manual fix in psql.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_window_order" CHECK ("window_end" > "window_start"),
  ADD CONSTRAINT "appointments_duration_positive" CHECK ("service_duration_minutes" > 0),
  ADD CONSTRAINT "appointments_times_in_day" CHECK (
    "promised_start" BETWEEN 0 AND 1439
    AND "window_start" BETWEEN 0 AND 1439
    AND "window_end" BETWEEN 0 AND 1439
  ),
  -- The confirmed business rule: the ENTIRE visit fits inside the customer's availability,
  -- not merely its start.
  ADD CONSTRAINT "appointments_visit_fits_window" CHECK (
    "promised_start" >= "window_start"
    AND "promised_start" + "service_duration_minutes" <= "window_end"
  );

ALTER TABLE "locations"
  ADD CONSTRAINT "locations_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "locations_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180);

ALTER TABLE "localities"
  ADD CONSTRAINT "localities_latitude_range" CHECK ("centroid_latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "localities_longitude_range" CHECK ("centroid_longitude" BETWEEN -180 AND 180);

ALTER TABLE "day_settings"
  ADD CONSTRAINT "day_settings_singleton" CHECK ("id" = 'singleton'),
  ADD CONSTRAINT "day_settings_workday_order" CHECK ("workday_end" > "workday_start");

-- One team cannot be in two places at once. This is an INTERVAL OVERLAP, which no unique
-- index can express -- but an exclusion constraint can, and it is the only thing that
-- serialises two schedulers committing into the same gap concurrently.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "date" WITH =,
    int4range("promised_start", "promised_start" + "service_duration_minutes") WITH &&
  ) WHERE ("status" IN ('SCHEDULED', 'COMPLETED'));
