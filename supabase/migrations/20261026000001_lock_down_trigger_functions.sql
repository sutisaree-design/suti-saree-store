-- Lock down trigger-only functions: not callable from the browser (anon/authenticated)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.pronargs = 0
      AND p.proname = ANY (ARRAY[
        'apply_gift_card_transaction','apply_loyalty_ledger_entry',
        'calculate_order_item_settlement_fee','check_vendor_return_threshold',
        'check_vendor_return_threshold_on_rto','create_vendor_clawback_if_paid',
        'guard_order_cod_fields','guard_order_item_fulfillment_fields',
        'guard_vendor_product_fields','handle_new_user','log_order_status_change',
        'orders_apply_partial_pay','orders_set_gst','set_order_original_payment_method',
        'set_product_barcode','set_variant_unit_barcode','sync_affiliate_payout_status',
        'sync_product_rating','sync_reseller_payout_status',
        'sync_vendor_return_hold_on_queue_resolve','void_affiliate_payout_on_return',
        'void_reseller_payout_on_return'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Pin search_path on helper functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'touch_updated_at','handle_new_user','sync_product_rating',
        'apply_loyalty_ledger_entry','apply_gift_card_transaction',
        'init_reseller_payout_status','touch_quantity_timestamp',
        'touch_order_item_stage_timestamp','touch_approval_status_timestamp',
        'init_affiliate_payout_status'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END $$;