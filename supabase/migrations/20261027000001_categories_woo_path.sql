-- Stores the WooCommerce category path so old URLs stay identical,
-- e.g. clothing/women-clothing/saree/handloom-saree
alter table public.categories add column if not exists woo_path text;
create unique index if not exists categories_woo_path_key on public.categories (woo_path) where woo_path is not null;
