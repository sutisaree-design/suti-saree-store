-- affiliates is only accessed through server routes using the service role key.
-- Remove the open anon policies so the browser cannot insert/update/delete rows.
DROP POLICY IF EXISTS anon_delete_affiliates ON public.affiliates;
DROP POLICY IF EXISTS anon_insert_affiliates ON public.affiliates;
DROP POLICY IF EXISTS anon_update_affiliates ON public.affiliates;