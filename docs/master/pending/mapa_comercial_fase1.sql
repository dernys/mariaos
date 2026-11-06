-- MAPA COMERCIAL (fase 1): directorio geográfico público + portal del propietario + moderación.
-- Geo: lat/lng numéricos con índice compuesto (búsqueda por bbox). PostGIS no se usa en esta fase.

CREATE TABLE public.commerce_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon text NOT NULL DEFAULT 'store',
  color text NOT NULL DEFAULT '160 84% 39%',
  sort integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.commerce_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.commerce_categories TO authenticated;
GRANT ALL ON public.commerce_categories TO service_role;
ALTER TABLE public.commerce_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_public_read" ON public.commerce_categories FOR SELECT TO anon, authenticated USING (active OR public.is_superadmin(auth.uid()));
CREATE POLICY "cc_sa_insert" ON public.commerce_categories FOR INSERT TO authenticated WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "cc_sa_update" ON public.commerce_categories FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE POLICY "cc_sa_delete" ON public.commerce_categories FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()));

CREATE TABLE public.commerce_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,80}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  category_id uuid REFERENCES public.commerce_categories(id) ON DELETE SET NULL,
  logo_url text CHECK (logo_url IS NULL OR logo_url ~ '^https://'),
  cover_url text CHECK (cover_url IS NULL OR cover_url ~ '^https://'),
  photos text[] NOT NULL DEFAULT '{}' CHECK (cardinality(photos) <= 12),
  website text CHECK (website IS NULL OR website ~ '^https?://'),
  instagram text CHECK (instagram IS NULL OR char_length(instagram) <= 120),
  facebook text CHECK (facebook IS NULL OR char_length(facebook) <= 200),
  phone text CHECK (phone IS NULL OR phone ~ '^\+?[0-9 ()-]{8,20}$'),
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{10,15}$'),
  country_code text NOT NULL DEFAULT 'BR' CHECK (country_code ~ '^[A-Z]{2}$'),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  locale text NOT NULL DEFAULT 'pt-BR',
  price_level smallint CHECK (price_level IS NULL OR price_level BETWEEN 1 AND 4),
  services text[] NOT NULL DEFAULT '{}',
  accessibility text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','published','rejected','suspended')),
  featured boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  published_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cb_tenant ON public.commerce_businesses(tenant_id);
CREATE INDEX idx_cb_status ON public.commerce_businesses(status, category_id);

CREATE TABLE public.commerce_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.commerce_businesses(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_id uuid,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  is_main boolean NOT NULL DEFAULT false,
  street text, number text, complement text, neighborhood text,
  city text NOT NULL CHECK (char_length(btrim(city)) BETWEEN 2 AND 80),
  state text NOT NULL CHECK (char_length(state) BETWEEN 2 AND 40),
  postal_code text CHECK (postal_code IS NULL OR postal_code ~ '^[0-9A-Za-z -]{3,12}$'),
  country_code text NOT NULL DEFAULT 'BR' CHECK (country_code ~ '^[A-Z]{2}$'),
  lat numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  phone text CHECK (phone IS NULL OR phone ~ '^\+?[0-9 ()-]{8,20}$'),
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{10,15}$'),
  opening_hours jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(opening_hours) = 'array'),
  hours_verified boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cbr_business ON public.commerce_branches(business_id);
CREATE INDEX idx_cbr_tenant ON public.commerce_branches(tenant_id);
CREATE INDEX idx_cbr_geo ON public.commerce_branches(lat, lng);
CREATE INDEX idx_cbr_city ON public.commerce_branches(country_code, state, lower(city));

CREATE TABLE public.commerce_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.commerce_businesses(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'product' CHECK (kind IN ('product','service')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 600),
  price numeric(12,2) CHECK (price IS NULL OR price >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  is_public boolean NOT NULL DEFAULT false,
  image_url text CHECK (image_url IS NULL OR image_url ~ '^https://'),
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_co_business ON public.commerce_offerings(business_id, is_public);

CREATE TABLE public.commerce_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.commerce_businesses(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 600),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX idx_cp_business ON public.commerce_promotions(business_id);

CREATE TABLE public.commerce_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.commerce_businesses(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  action text NOT NULL,
  from_status text, to_status text,
  reason text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cml_business ON public.commerce_moderation_log(business_id, created_at DESC);

CREATE TABLE public.commerce_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.commerce_businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.commerce_branches(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view','call','whatsapp','navigate','website','share')),
  session_hash text NOT NULL CHECK (char_length(session_hash) BETWEEN 8 AND 64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ce_business ON public.commerce_events(business_id, created_at DESC);
CREATE INDEX idx_ce_dedupe ON public.commerce_events(business_id, session_hash, event_type, created_at DESC);

CREATE TABLE public.commerce_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.commerce_businesses(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('wrong_info','closed','inappropriate','spam','other')),
  details text CHECK (details IS NULL OR char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolved_by uuid, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cr_status ON public.commerce_reports(status, created_at DESC);

-- Helper: ¿negocio publicado? (para hijos públicos)
CREATE OR REPLACE FUNCTION public.commerce_is_public(_business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.commerce_businesses WHERE id = _business AND status = 'published')
$$;
GRANT EXECUTE ON FUNCTION public.commerce_is_public(uuid) TO anon, authenticated;

-- GRANTS (anon: solo columnas públicas)
GRANT SELECT (id, tenant_id, slug, name, description, category_id, logo_url, cover_url, photos, website, instagram, facebook, phone, whatsapp, country_code, currency, locale, price_level, services, accessibility, status, featured, published_at, updated_at)
  ON public.commerce_businesses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_businesses TO authenticated;
GRANT ALL ON public.commerce_businesses TO service_role;
GRANT SELECT (id, business_id, name, is_main, street, number, complement, neighborhood, city, state, postal_code, country_code, lat, lng, phone, whatsapp, opening_hours, hours_verified, timezone, active)
  ON public.commerce_branches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_branches TO authenticated;
GRANT ALL ON public.commerce_branches TO service_role;
GRANT SELECT (id, business_id, kind, name, description, price, currency, is_public, image_url, sort) ON public.commerce_offerings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_offerings TO authenticated;
GRANT ALL ON public.commerce_offerings TO service_role;
GRANT SELECT (id, business_id, title, description, starts_at, ends_at, is_active) ON public.commerce_promotions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_promotions TO authenticated;
GRANT ALL ON public.commerce_promotions TO service_role;
GRANT SELECT ON public.commerce_moderation_log TO authenticated;
GRANT ALL ON public.commerce_moderation_log TO service_role;
GRANT SELECT ON public.commerce_events TO authenticated;
GRANT ALL ON public.commerce_events TO service_role;
GRANT SELECT, UPDATE ON public.commerce_reports TO authenticated;
GRANT ALL ON public.commerce_reports TO service_role;

ALTER TABLE public.commerce_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_moderation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_reports ENABLE ROW LEVEL SECURITY;

-- Negocios
CREATE POLICY "cb_public_read" ON public.commerce_businesses FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "cb_member_read" ON public.commerce_businesses FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "cb_member_insert" ON public.commerce_businesses FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(tenant_id) AND status = 'draft' AND featured = false);
CREATE POLICY "cb_member_update" ON public.commerce_businesses FOR UPDATE TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "cb_member_delete" ON public.commerce_businesses FOR DELETE TO authenticated USING (public.is_tenant_member(tenant_id) AND status IN ('draft','rejected'));

-- Hijos: lectura pública si el negocio está publicado; escritura del tenant dueño
CREATE POLICY "cbr_public_read" ON public.commerce_branches FOR SELECT TO anon, authenticated USING (active AND public.commerce_is_public(business_id));
CREATE POLICY "cbr_member_all" ON public.commerce_branches FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid())) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "co_public_read" ON public.commerce_offerings FOR SELECT TO anon, authenticated USING (is_public AND public.commerce_is_public(business_id));
CREATE POLICY "co_member_all" ON public.commerce_offerings FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid())) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "cp_public_read" ON public.commerce_promotions FOR SELECT TO anon, authenticated USING (is_active AND (ends_at IS NULL OR ends_at > now()) AND public.commerce_is_public(business_id));
CREATE POLICY "cp_member_all" ON public.commerce_promotions FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid())) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "cml_read" ON public.commerce_moderation_log FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "ce_read" ON public.commerce_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "cr_sa_read" ON public.commerce_reports FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));
CREATE POLICY "cr_sa_update" ON public.commerce_reports FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- Trigger: integridad de tenant en hijos, versión y bloqueo de campos de moderación
CREATE OR REPLACE FUNCTION public.commerce_child_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.commerce_businesses WHERE id = NEW.business_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'commerce: negocio inexistente'; END IF;
  NEW.tenant_id := v_tenant;
  IF TG_TABLE_NAME = 'commerce_branches' THEN
    IF TG_OP = 'UPDATE' THEN NEW.version := OLD.version + 1; END IF;
    NEW.updated_at := now();
  ELSIF TG_TABLE_NAME = 'commerce_offerings' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cbr_guard BEFORE INSERT OR UPDATE ON public.commerce_branches FOR EACH ROW EXECUTE FUNCTION public.commerce_child_guard();
CREATE TRIGGER trg_co_guard BEFORE INSERT OR UPDATE ON public.commerce_offerings FOR EACH ROW EXECUTE FUNCTION public.commerce_child_guard();
CREATE TRIGGER trg_cp_guard BEFORE INSERT OR UPDATE ON public.commerce_promotions FOR EACH ROW EXECUTE FUNCTION public.commerce_child_guard();

CREATE OR REPLACE FUNCTION public.commerce_business_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id <> OLD.tenant_id THEN RAISE EXCEPTION 'commerce: no se puede cambiar el tenant'; END IF;
    IF coalesce(current_setting('maria.commerce_moderation', true), '') <> 'on' THEN
      IF NEW.status IS DISTINCT FROM OLD.status OR NEW.featured IS DISTINCT FROM OLD.featured
         OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
        RAISE EXCEPTION 'commerce: el estado solo cambia mediante el flujo de publicación';
      END IF;
      IF OLD.status = 'suspended' THEN RAISE EXCEPTION 'commerce: negocio suspendido, contacte a moderación'; END IF;
    END IF;
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cb_guard BEFORE UPDATE ON public.commerce_businesses FOR EACH ROW EXECUTE FUNCTION public.commerce_business_guard();

-- RPC: enviar a revisión
CREATE OR REPLACE FUNCTION public.commerce_submit_for_review(p_business uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.commerce_businesses%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.commerce_businesses WHERE id = p_business FOR UPDATE;
  IF NOT FOUND OR NOT public.is_tenant_member(b.tenant_id) THEN RAISE EXCEPTION 'commerce: sin permiso'; END IF;
  IF b.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'commerce: estado % no puede enviarse a revisión', b.status; END IF;
  IF b.category_id IS NULL THEN RAISE EXCEPTION 'commerce: falta la categoría'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commerce_branches WHERE business_id = p_business AND active) THEN
    RAISE EXCEPTION 'commerce: se necesita al menos una sucursal con ubicación';
  END IF;
  PERFORM set_config('maria.commerce_moderation', 'on', true);
  UPDATE public.commerce_businesses SET status = 'pending_review', submitted_at = now() WHERE id = p_business;
  INSERT INTO public.commerce_moderation_log(business_id, tenant_id, action, from_status, to_status, actor_id)
  VALUES (p_business, b.tenant_id, 'submit', b.status, 'pending_review', auth.uid());
  RETURN 'pending_review';
END $$;

-- RPC: moderación (superadmin global)
CREATE OR REPLACE FUNCTION public.commerce_moderate(p_business uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.commerce_businesses%ROWTYPE; v_to text;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'commerce: solo moderadores'; END IF;
  SELECT * INTO b FROM public.commerce_businesses WHERE id = p_business FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commerce: negocio inexistente'; END IF;
  IF p_action IN ('reject','suspend') AND coalesce(char_length(btrim(p_reason)),0) < 5 THEN
    RAISE EXCEPTION 'commerce: indique el motivo (mín. 5 caracteres)';
  END IF;
  PERFORM set_config('maria.commerce_moderation', 'on', true);
  v_to := b.status;
  IF p_action = 'approve' THEN
    IF b.status NOT IN ('pending_review','suspended','rejected') THEN RAISE EXCEPTION 'commerce: transición inválida'; END IF;
    v_to := 'published';
    UPDATE public.commerce_businesses SET status = v_to, published_at = coalesce(published_at, now()) WHERE id = p_business;
  ELSIF p_action = 'reject' THEN
    IF b.status <> 'pending_review' THEN RAISE EXCEPTION 'commerce: transición inválida'; END IF;
    v_to := 'rejected';
    UPDATE public.commerce_businesses SET status = v_to WHERE id = p_business;
  ELSIF p_action = 'suspend' THEN
    v_to := 'suspended';
    UPDATE public.commerce_businesses SET status = v_to, featured = false WHERE id = p_business;
  ELSIF p_action = 'feature' THEN
    IF b.status <> 'published' THEN RAISE EXCEPTION 'commerce: solo negocios publicados'; END IF;
    UPDATE public.commerce_businesses SET featured = true WHERE id = p_business;
  ELSIF p_action = 'unfeature' THEN
    UPDATE public.commerce_businesses SET featured = false WHERE id = p_business;
  ELSE
    RAISE EXCEPTION 'commerce: acción desconocida';
  END IF;
  INSERT INTO public.commerce_moderation_log(business_id, tenant_id, action, from_status, to_status, reason, actor_id)
  VALUES (p_business, b.tenant_id, p_action, b.status, v_to, nullif(btrim(p_reason), ''), auth.uid());
  RETURN v_to;
END $$;

-- RPC pública: registrar evento de analítica (anónimo, deduplicado 30 min)
CREATE OR REPLACE FUNCTION public.commerce_track_event(p_business uuid, p_type text, p_session text, p_branch uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  IF p_type NOT IN ('view','call','whatsapp','navigate','website','share') THEN RETURN; END IF;
  IF p_session IS NULL OR char_length(p_session) NOT BETWEEN 8 AND 64 THEN RETURN; END IF;
  SELECT tenant_id INTO v_tenant FROM public.commerce_businesses WHERE id = p_business AND status = 'published';
  IF v_tenant IS NULL THEN RETURN; END IF;
  IF p_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.commerce_branches WHERE id = p_branch AND business_id = p_business) THEN
    p_branch := NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.commerce_events WHERE business_id = p_business AND session_hash = p_session
             AND event_type = p_type AND created_at > now() - interval '30 minutes') THEN RETURN; END IF;
  INSERT INTO public.commerce_events(business_id, branch_id, tenant_id, event_type, session_hash)
  VALUES (p_business, p_branch, v_tenant, p_type, p_session);
END $$;

-- RPC pública: reportar negocio
CREATE OR REPLACE FUNCTION public.commerce_report_business(p_business uuid, p_reason text, p_details text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.commerce_is_public(p_business) THEN RAISE EXCEPTION 'commerce: negocio no disponible'; END IF;
  IF (SELECT count(*) FROM public.commerce_reports WHERE business_id = p_business AND created_at > now() - interval '1 hour') > 20 THEN
    RAISE EXCEPTION 'commerce: demasiados reportes, intente más tarde';
  END IF;
  INSERT INTO public.commerce_reports(business_id, reason, details) VALUES (p_business, p_reason, left(nullif(btrim(p_details), ''), 1000));
END $$;

-- RPC propietario: estadísticas
CREATE OR REPLACE FUNCTION public.commerce_owner_stats(p_business uuid, p_days integer DEFAULT 30)
RETURNS TABLE(event_type text, branch_id uuid, total bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.commerce_businesses WHERE id = p_business;
  IF v_tenant IS NULL OR NOT (public.is_tenant_member(v_tenant) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'commerce: sin permiso';
  END IF;
  RETURN QUERY SELECT e.event_type, e.branch_id, count(*)::bigint FROM public.commerce_events e
   WHERE e.business_id = p_business AND e.created_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
   GROUP BY e.event_type, e.branch_id;
END $$;

REVOKE ALL ON FUNCTION public.commerce_submit_for_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_moderate(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_owner_stats(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_child_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_submit_for_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_moderate(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_owner_stats(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_track_event(uuid, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_report_business(uuid, text, text) TO anon, authenticated;

-- Medios: carpeta = tenant_id
CREATE POLICY "commerce_media_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'commerce-media');
CREATE POLICY "commerce_media_member_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'commerce-media' AND public.is_tenant_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "commerce_media_member_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'commerce-media' AND public.is_tenant_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "commerce_media_member_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'commerce-media' AND public.is_tenant_member(((storage.foldername(name))[1])::uuid));

-- Taxonomía base (no son negocios)
INSERT INTO public.commerce_categories(slug, name_i18n, icon, color, sort) VALUES
 ('restaurantes', '{"pt-BR":"Restaurantes","es":"Restaurantes","en":"Restaurants"}', 'utensils', '14 85% 55%', 10),
 ('bares', '{"pt-BR":"Bares","es":"Bares","en":"Bars"}', 'beer', '38 92% 50%', 20),
 ('cafeterias', '{"pt-BR":"Cafeterias e padarias","es":"Cafeterías y panaderías","en":"Cafés & bakeries"}', 'coffee', '25 60% 45%', 30),
 ('mercados', '{"pt-BR":"Mercados","es":"Mercados","en":"Groceries"}', 'shopping-basket', '142 70% 40%', 40),
 ('moda', '{"pt-BR":"Moda","es":"Moda","en":"Fashion"}', 'shirt', '330 75% 55%', 50),
 ('saude', '{"pt-BR":"Saúde e farmácia","es":"Salud y farmacia","en":"Health & pharmacy"}', 'heart-pulse', '0 75% 55%', 60),
 ('beleza', '{"pt-BR":"Beleza","es":"Belleza","en":"Beauty"}', 'sparkles', '280 65% 60%', 70),
 ('servicos', '{"pt-BR":"Serviços","es":"Servicios","en":"Services"}', 'wrench', '210 80% 55%', 80),
 ('tecnologia', '{"pt-BR":"Tecnologia","es":"Tecnología","en":"Technology"}', 'cpu', '190 85% 45%', 90),
 ('outros', '{"pt-BR":"Outros","es":"Otros","en":"Other"}', 'store', '220 15% 55%', 999)
ON CONFLICT (slug) DO NOTHING;
