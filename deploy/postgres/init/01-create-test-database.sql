-- Runs once, when the data volume is first initialised.
-- Integration tests use their own database so they never touch local data.
CREATE DATABASE geo_test;
