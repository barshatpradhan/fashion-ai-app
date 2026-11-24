-- Table privileges for the Data API roles.
-- Projects created without "automatically expose new tables" grant the API roles only
-- REFERENCES/TRIGGER/TRUNCATE, so every REST call fails with 42501. Access control stays
-- with the RLS policies in 0001 (RLS is enabled on every table; tables without client
-- policies remain service-role only).
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
