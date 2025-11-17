CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  email text UNIQUE,
  name text,
  google_refresh_token text,
  google_access_token text,
  created_at timestamp default now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id serial PRIMARY KEY,
  user_id int references users(id) on delete cascade,
  name text,
  phone text,
  email text,
  created_at timestamp default now()
);
