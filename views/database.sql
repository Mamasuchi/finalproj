CREATE DATABASE favquotes;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL
);

CREATE TABLE favorite_quotes (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  quote TEXT NOT NULL,
  author VARCHAR(100)
);

CREATE TABLE quotes (
  id SERIAL PRIMARY KEY,
  quote TEXT NOT NULL,
  author VARCHAR(255),
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
);

CREATE TABLE follows (
  follower VARCHAR NOT NULL,
  followed VARCHAR NOT NULL,
  PRIMARY KEY (follower, followed)
);
