CREATE TABLE site_banners (
  uid text PRIMARY KEY,
  message text NOT NULL,
  color_preset text NOT NULL,
  link text NOT NULL,
  screens jsonb NOT NULL DEFAULT '[]'::jsonb,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_banners_active_ends_at_uid_idx ON site_banners (ends_at, uid);
CREATE INDEX site_banners_starts_at_idx ON site_banners (starts_at);
