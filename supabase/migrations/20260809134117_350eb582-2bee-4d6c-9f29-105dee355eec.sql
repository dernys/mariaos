CREATE OR REPLACE FUNCTION public.assert_journal_entry_balanced()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_entry uuid; v_status text; v_d numeric; v_c numeric;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    IF TG_OP = 'DELETE' THEN v_entry := OLD.id; ELSE v_entry := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN v_entry := OLD.entry_id; ELSE v_entry := NEW.entry_id; END IF;
  END IF;

  SELECT status INTO v_status FROM public.journal_entries WHERE id = v_entry;
  IF v_status IS NULL OR v_status <> 'posted' THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_d, v_c
  FROM public.journal_entry_lines WHERE entry_id = v_entry;

  IF round(v_d,2) <> round(v_c,2) THEN
    RAISE EXCEPTION 'Partida doble violada en el asiento %: debe % <> haber %', v_entry, v_d, v_c;
  END IF;
  RETURN NULL;
END $$;