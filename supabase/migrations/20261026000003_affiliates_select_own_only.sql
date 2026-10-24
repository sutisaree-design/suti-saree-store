-- affiliates was readable by everyone (anon + authenticated, USING true).
-- Replace it with: a signed-in user can read only their own row.
-- Server routes use the service role key and are not affected.
DROP POLICY IF EXISTS anon_select_affiliates ON public.affiliates;
CREATE POLICY own_select_affiliates ON public.affiliates
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));