CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  satellite_id INTEGER REFERENCES satellites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value REAL NOT NULL,
  threshold REAL NOT NULL,
  triggered_at TIMESTAMPTZ DEFAULT now()
);
