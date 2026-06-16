
ALTER TABLE public.journal_entries REPLICA IDENTITY FULL;
ALTER TABLE public.journal_entry_lines REPLICA IDENTITY FULL;
ALTER TABLE public.financial_events REPLICA IDENTITY FULL;
ALTER TABLE public.general_ledger REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entry_lines; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.general_ledger; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
