-- Add landmark column to addresses table to match checkout address fields
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS landmark text;
