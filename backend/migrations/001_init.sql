-- Enum for job status
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'done', 'failed');

-- Satellites table
CREATE TABLE satellites (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  orbit_type TEXT
);

-- Telemetry events table
CREATE TABLE telemetry_events (
  id SERIAL PRIMARY KEY,
  satellite_id INTEGER REFERENCES satellites(id) ON DELETE CASCADE,
  temperature REAL,
  battery REAL,
  signal_strength REAL,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- Jobs table
CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  status job_status DEFAULT 'pending',
  retries INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);