
ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS receipt_width int NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS receipt_footer text DEFAULT '¡Gracias por su compra!',
  ADD COLUMN IF NOT EXISTS silent_print boolean NOT NULL DEFAULT false;
