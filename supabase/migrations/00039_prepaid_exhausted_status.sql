-- Must be in its own migration: PostgreSQL forbids using a new enum value
-- in the same transaction as ALTER TYPE ... ADD VALUE (SQLSTATE 55P04).
-- No-op when 00005 already created the enum with 'exhausted' (fresh installs).
ALTER TYPE prepaid_package_status ADD VALUE IF NOT EXISTS 'exhausted';
