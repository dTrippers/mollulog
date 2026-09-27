CREATE TABLE navigation_menu_badges (
  menu_id text PRIMARY KEY,
  label_mode text NOT NULL DEFAULT 'auto',
  label text,
  red_dot_mode text NOT NULL DEFAULT 'auto',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
