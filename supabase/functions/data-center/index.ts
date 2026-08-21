import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ENTITIES, EXPORT_ONLY, BACKUP_ENTITIES, CLONEABLE_ENTITIES, coerce, validate, type EntityDef, type EntityKey } from "./entities.ts";
import { resolveTenantScope } from "../_shared/tenantScope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;
const EXPORT_PAGE = 1000;
const MAX_EXPORT_ROWS = 100_000;
const SCHEMA_VERSION = "v1";

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Admin = ReturnType<typeof createClient>;

/** Reads every row of a tenant-scoped table in bounded pages. */
async function fetchAll(admin: Admin, table: string, tenantId: string, opts: { dateColumn?: string; from?: string; to?: string; filters?: Record<string, string> } = {}) {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page * EXPORT_PAGE < MAX_EXPORT_ROWS; page++) {
    let q = admin.from(table).select("*").eq("tenant_id", tenantId).range(page * EXPORT_PAGE, page * EXPORT_PAGE + EXPORT_PAGE - 1);
    if (opts.dateColumn && opts.from) q = q.gte(opts.dateColumn, opts.from);
    if (opts.dateColumn && opts.to) q = q.lte(opts.dateColumn, opts.to);
    for (const [k, v] of Object.entries(opts.filters ?? {})) {
      if (v) q = q.eq(k, v);
    }
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < EXPORT_PAGE) break;
  }
  return rows;
}

async function logAudit(admin: Admin, params: { tenantId: string; userId: string; action: string; entityId: string; description: string; metadata?: Record<string, unknown> }) {
  await admin.from("activity_log").insert({
    entity_type: "data_center",
    entity_id: params.entityId,
    action: params.action,
    description: params.description,
    metadata: params.metadata ?? {},
    tenant_id: params.tenantId,
    performed_by: params.userId,
  });
}

/** Matches an incoming row against existing records using the entity natural keys. */
function findExisting(def: EntityDef, row: Record<string, unknown>, existing: Record<string, unknown>[]) {
  for (const keys of def.naturalKeys) {
    if (keys.some((k) => row[k] === null || row[k] === undefined || String(row[k]).trim() === "")) continue;
    const hit = existing.find((e) => keys.every((k) => String(e[k] ?? "").trim().toLowerCase() === String(row[k] ?? "").trim().toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---------- Authentication: identity always from the bearer token ----------
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "No autenticado" }, 401);
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) return json({ error: "No autenticado" }, 401);

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Solicitud demasiado grande" }, 413);
    let body: Record<string, any> = {};
    if (raw) { try { body = JSON.parse(raw); } catch { return json({ error: "Cuerpo inválido" }, 400); } }
    const action = String(body.action ?? "");

    // ---------- Authorization: tenant resolved server-side (membership o contexto activo del superadmin) ----------
    const requested = typeof body.tenant_id === "string" ? body.tenant_id : null;
    const scope = await resolveTenantScope(admin, caller.id, requested);
    if (scope.error) return json({ error: scope.error.message }, scope.error.status);
    const isSA = scope.isSuperadmin;
    const tenantId = scope.tenantId;
    if (!tenantId) return json({ error: "Sin negocio asignado" }, 403);
    {
      const { data: t } = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();
      if (!t) return json({ error: "Negocio no encontrado" }, 404);
    }

    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    const isAdmin = !!isSA || roles.includes("admin");
    const canExport = isAdmin || roles.includes("contador") || roles.includes("gerente");
    const requireAdmin = () => { if (!isAdmin) throw Object.assign(new Error("Se requiere rol administrador"), { status: 403 }); };

    // ============================== DASHBOARD ==============================
    if (action === "dashboard") {
      if (!canExport) return json({ error: "Sin permiso" }, 403);
      const [{ data: backups }, { data: ops }] = await Promise.all([
        admin.from("data_backups").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(5),
        admin.from("data_operations").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(10),
      ]);
      const list = ops ?? [];
      return json({
        last_backup: (backups ?? [])[0] ?? null,
        backups_count: (backups ?? []).length,
        last_import: list.find((o: any) => o.kind === "import") ?? null,
        last_export: list.find((o: any) => o.kind === "export") ?? null,
        pending: list.filter((o: any) => ["pending", "processing", "validating", "committing"].includes(o.status)),
        recent_errors: list.filter((o: any) => o.status === "failed" || o.error_count > 0).slice(0, 5),
        recent: list,
        storage_bytes: (backups ?? []).reduce((s: number, b: any) => s + Number(b.size_bytes ?? 0), 0),
      });
    }

    // ============================== EXPORT ==============================
    if (action === "export") {
      if (!canExport) return json({ error: "Sin permiso para exportar" }, 403);
      const entity = String(body.entity ?? "");
      const def = (ENTITIES as Record<string, EntityDef>)[entity];
      const ro = EXPORT_ONLY[entity];
      if (!def && !ro) return json({ error: "Entidad no válida" }, 400);
      const table = def?.table ?? ro!.table;
      const dateColumn = body.from || body.to ? (def?.dateColumn ?? ro?.dateColumn) : undefined;
      const rows = await fetchAll(admin, table, tenantId, {
        dateColumn, from: body.from, to: body.to,
        filters: typeof body.filters === "object" && body.filters ? body.filters : {},
      });
      const { data: op } = await admin.from("data_operations").insert({
        tenant_id: tenantId, kind: "export", entity, status: "completed",
        total_rows: rows.length, created_by: caller.id, finished_at: new Date().toISOString(),
        summary: { format: body.format ?? "xlsx", from: body.from ?? null, to: body.to ?? null },
      }).select("*").single();
      await logAudit(admin, { tenantId, userId: caller.id, action: "EXPORT_CREATED", entityId: op?.id ?? entity, description: `Exportación de ${entity} (${rows.length} registros)`, metadata: { entity, rows: rows.length } });
      return json({ entity, rows, count: rows.length, operation: op });
    }

    // ============ IMPORT CONTEXT (for client-side staging suggestions) ============
    if (action === "import_context") {
      requireAdmin();
      const entity = String(body.entity ?? "") as EntityKey;
      const def = ENTITIES[entity];
      if (!def) return json({ error: "Entidad no importable" }, 400);
      const existingRows = await fetchAll(admin, def.table, tenantId);
      const keep = new Set(["id", ...def.columns]);
      const existing = existingRows.map((r) => {
        const o: Record<string, unknown> = {};
        for (const k of Object.keys(r)) if (keep.has(k)) o[k] = r[k];
        return o;
      });
      const [cats, units] = await Promise.all([
        admin.from("product_categories").select("name").eq("tenant_id", tenantId),
        admin.from("units_of_measure").select("code").eq("tenant_id", tenantId),
      ]);
      return json({
        entity,
        existing,
        categories: (cats.data ?? []).map((c: any) => c.name).filter(Boolean),
        units: (units.data ?? []).map((u: any) => u.code).filter(Boolean),
      });
    }

    // ============ IMPORT LIFECYCLE AUDIT (review / modify / cancel) ============
    if (action === "import_event") {
      requireAdmin();
      const allowed = ["IMPORT_REVIEWED", "IMPORT_MODIFIED", "IMPORT_CANCELLED"];
      const evt = String(body.event ?? "");
      if (!allowed.includes(evt)) return json({ error: "Evento no soportado" }, 400);
      await logAudit(admin, {
        tenantId, userId: caller.id, action: evt,
        entityId: String(body.entity ?? "data_center"),
        description: String(body.description ?? evt).slice(0, 400),
        metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : {},
      });
      return json({ logged: true });
    }

    // ============================== IMPORT (staging → validate → commit) ==============================
    if (action === "import") {
      requireAdmin();
      const entity = String(body.entity ?? "") as EntityKey;
      const def = ENTITIES[entity];
      if (!def) return json({ error: "Entidad no importable" }, 400);
      const incoming: Record<string, unknown>[] = Array.isArray(body.rows) ? body.rows : [];
      if (incoming.length === 0) return json({ error: "No hay filas para importar" }, 400);
      if (incoming.length > MAX_IMPORT_ROWS) return json({ error: `Máximo ${MAX_IMPORT_ROWS} filas por lote` }, 400);
      const dryRun = body.dry_run === true;
      const strategy: string = ["create", "update", "skip", "upsert", "fail"].includes(body.strategy) ? body.strategy : "upsert";

      const existing = await fetchAll(admin, def.table, tenantId);

      const errors: { row: number; field?: string; value?: string; problem: string; fix: string }[] = [];
      const toInsert: Record<string, unknown>[] = [];
      const toUpdate: { id: string; row: Record<string, unknown> }[] = [];
      let skipped = 0;
      const seen = new Set<string>();

      incoming.forEach((raw, i) => {
        const rowNo = Number(raw.__row ?? i + 2);
        const row = coerce(def, raw);
        const issues = validate(def, row);
        // in-file duplicate detection over the first natural key
        const dedupeKey = def.naturalKeys[0].map((k) => String(row[k] ?? "").toLowerCase()).join("|");
        if (dedupeKey.replace(/\|/g, "") && seen.has(dedupeKey)) issues.push("Registro duplicado dentro del archivo");
        seen.add(dedupeKey);

        if (issues.length) {
          issues.forEach((problem) => errors.push({ row: rowNo, problem, fix: "Corrige el valor en el archivo y vuelve a importar" }));
          return;
        }
        const hit = findExisting(def, row, existing);
        if (hit) {
          if (strategy === "fail") { errors.push({ row: rowNo, problem: "Registro ya existente", fix: "Elimina la fila o cambia la estrategia de duplicados" }); return; }
          if (strategy === "create" || strategy === "skip") { skipped++; return; }
          toUpdate.push({ id: String(hit.id), row });
        } else {
          if (strategy === "update") { skipped++; return; }
          toInsert.push({ ...row, tenant_id: tenantId });
        }
      });

      const preview = {
        total: incoming.length, to_create: toInsert.length, to_update: toUpdate.length,
        skipped, errors: errors.length, error_rows: errors.slice(0, 500),
      };
      if (dryRun) return json({ dry_run: true, ...preview });

      // ---- restore point before a mass write (aborts the import when it fails)
      let restorePointId: string | null = null;
      if (body.create_restore_point === true) {
        try {
          const snapshot = {
            manifest: {
              format: "maria-package", package_version: "1.0", schema_version: SCHEMA_VERSION,
              tenant_id: tenantId, created_at: new Date().toISOString(), created_by: caller.id,
              export_type: "partial", entities: [entity], record_count: existing.length,
            },
            data: { [entity]: existing },
          };
          const payload = JSON.stringify(snapshot);
          const checksum = await sha256(payload);
          const { data: bk, error: bkErr } = await admin.from("data_backups").insert({
            tenant_id: tenantId, label: `Punto de restauración previo a importar ${def.label}`,
            kind: "pre_operation", scope: "partial", entities: [entity], size_bytes: payload.length,
            record_count: existing.length, checksum, schema_version: SCHEMA_VERSION, status: "completed", created_by: caller.id,
            metadata: { manifest: snapshot.manifest },
          }).select("id").single();
          if (bkErr || !bk) throw new Error(bkErr?.message ?? "No se pudo registrar el punto de restauración");
          const path = `${tenantId}/${bk.id}.maria.json`;
          const { error: upErr } = await admin.storage.from("tenant-backups")
            .upload(path, new Blob([payload], { type: "application/json" }), { upsert: true });
          if (upErr) throw new Error(upErr.message);
          await admin.from("data_backups").update({ storage_path: path }).eq("id", bk.id);
          restorePointId = bk.id;
          await logAudit(admin, { tenantId, userId: caller.id, action: "BACKUP_CREATED", entityId: bk.id, description: "Punto de restauración previo a importación", metadata: { entity } });
        } catch (e) {
          if (body.allow_without_restore_point !== true) {
            await logAudit(admin, { tenantId, userId: caller.id, action: "IMPORT_FAILED", entityId: entity, description: `Importación abortada: el punto de restauración falló (${(e as Error).message})`, metadata: { entity } });
            return json({ error: `No se pudo crear el punto de restauración: ${(e as Error).message}. Importación cancelada.` }, 500);
          }
        }
      }

      const { data: op } = await admin.from("data_operations").insert({
        tenant_id: tenantId, kind: "import", entity, status: "committing", strategy,
        file_name: typeof body.file_name === "string" ? body.file_name.slice(0, 200) : null,
        file_checksum: typeof body.file_checksum === "string" ? body.file_checksum : null,
        total_rows: incoming.length, created_by: caller.id, restore_point_id: restorePointId,
        reversible: !!restorePointId,
      }).select("*").single();
      await logAudit(admin, { tenantId, userId: caller.id, action: "IMPORT_STARTED", entityId: op?.id ?? entity, description: `Importación de ${def.label}`, metadata: { entity, rows: incoming.length, strategy } });

      let created = 0, updated = 0, categoriesCreated = 0;
      try {
        // Explicitly authorised new categories (never created silently).
        const newCats: string[] = Array.isArray(body.create_categories)
          ? body.create_categories.map((c: unknown) => String(c).trim()).filter(Boolean).slice(0, 200)
          : [];
        if (newCats.length) {
          const { data: haveCats } = await admin.from("product_categories").select("name").eq("tenant_id", tenantId);
          const have = new Set((haveCats ?? []).map((c: any) => String(c.name).trim().toLowerCase()));
          const insert = newCats.filter((c) => !have.has(c.toLowerCase())).map((name) => ({ name, tenant_id: tenantId, is_active: true }));
          if (insert.length) {
            const { error } = await admin.from("product_categories").insert(insert);
            if (error) throw new Error(`product_categories: ${error.message}`);
            categoriesCreated = insert.length;
          }
        }
        for (let i = 0; i < toInsert.length; i += 200) {
          const batch = toInsert.slice(i, i + 200);
          const { error } = await admin.from(def.table).insert(batch);
          if (error) throw new Error(error.message);
          created += batch.length;
        }
        for (const u of toUpdate) {
          const { error } = await admin.from(def.table).update(u.row).eq("id", u.id).eq("tenant_id", tenantId);
          if (error) throw new Error(error.message);
          updated++;
        }
      } catch (e) {
        await admin.from("data_operations").update({
          status: "failed", error: (e as Error).message, created_count: created, updated_count: updated,
          error_count: errors.length + 1, errors, finished_at: new Date().toISOString(),
        }).eq("id", op?.id);
        await logAudit(admin, { tenantId, userId: caller.id, action: "IMPORT_FAILED", entityId: op?.id ?? entity, description: `Importación fallida: ${(e as Error).message}`, metadata: { entity } });
        return json({ error: (e as Error).message, operation_id: op?.id, created, updated, restore_point_id: restorePointId }, 500);
      }

      const { data: done } = await admin.from("data_operations").update({
        status: "completed", created_count: created, updated_count: updated,
        skipped_count: skipped, error_count: errors.length, errors: errors.slice(0, 500),
        summary: { ...preview, categories_created: categoriesCreated }, finished_at: new Date().toISOString(),
      }).eq("id", op?.id).select("*").single();
      await logAudit(admin, { tenantId, userId: caller.id, action: "IMPORT_COMMITTED", entityId: op?.id ?? entity, description: `Importación confirmada: ${created} nuevos, ${updated} actualizados, ${categoriesCreated} categorías nuevas`, metadata: { entity, created, updated, skipped, errors: errors.length, categories_created: categoriesCreated, restore_point_id: restorePointId } });
      await logAudit(admin, { tenantId, userId: caller.id, action: "IMPORT_COMPLETED", entityId: op?.id ?? entity, description: `Importación completada: ${created} nuevos, ${updated} actualizados`, metadata: { entity, created, updated, skipped, errors: errors.length } });
      return json({ ...preview, created, updated, categories_created: categoriesCreated, operation: done, restore_point_id: restorePointId });

      return json({ ...preview, created, updated, operation: done, restore_point_id: restorePointId });
    }

    // ============================== BACKUPS ==============================
    if (action === "backup_create") {
      requireAdmin();
      const entities: EntityKey[] = Array.isArray(body.entities) && body.entities.length
        ? body.entities.filter((e: string) => BACKUP_ENTITIES.includes(e as EntityKey))
        : BACKUP_ENTITIES;
      const label = String(body.label ?? `Backup ${new Date().toISOString().slice(0, 16).replace("T", " ")}`).slice(0, 160);
      const kind = ["manual", "auto", "pre_operation"].includes(body.kind) ? body.kind : "manual";

      const data: Record<string, unknown[]> = {};
      let count = 0;
      for (const key of entities) {
        const rows = await fetchAll(admin, ENTITIES[key].table, tenantId);
        data[key] = rows;
        count += rows.length;
      }
      const manifest = {
        format: "maria-package", package_version: "1.0", schema_version: SCHEMA_VERSION,
        tenant_id: tenantId, created_at: new Date().toISOString(), created_by: caller.id,
        export_type: entities.length === BACKUP_ENTITIES.length ? "full" : "partial",
        entities, record_count: count,
      };
      const payload = JSON.stringify({ manifest, data });
      const checksum = await sha256(payload);

      const { data: bk, error: bkErr } = await admin.from("data_backups").insert({
        tenant_id: tenantId, label, kind,
        scope: manifest.export_type, entities, size_bytes: payload.length, record_count: count,
        checksum, schema_version: SCHEMA_VERSION, status: "completed", created_by: caller.id,
        metadata: { manifest },
      }).select("*").single();
      if (bkErr) return json({ error: bkErr.message }, 500);

      const path = `${tenantId}/${bk.id}.maria.json`;
      const { error: upErr } = await admin.storage.from("tenant-backups")
        .upload(path, new Blob([payload], { type: "application/json" }), { upsert: true });
      if (upErr) {
        await admin.from("data_backups").update({ status: "failed", error: upErr.message }).eq("id", bk.id);
        return json({ error: upErr.message }, 500);
      }
      const { data: final } = await admin.from("data_backups").update({ storage_path: path }).eq("id", bk.id).select("*").single();
      await admin.from("data_operations").insert({
        tenant_id: tenantId, kind: "backup", status: "completed", total_rows: count,
        created_by: caller.id, restore_point_id: bk.id, finished_at: new Date().toISOString(),
        summary: { entities, size_bytes: payload.length, checksum },
      });
      await logAudit(admin, { tenantId, userId: caller.id, action: "BACKUP_CREATED", entityId: bk.id, description: `Backup ${label} (${count} registros)`, metadata: { entities, checksum, size_bytes: payload.length } });
      return json({ backup: final ?? bk });
    }

    if (action === "backup_list") {
      if (!canExport) return json({ error: "Sin permiso" }, 403);
      const { data } = await admin.from("data_backups").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
      return json({ backups: data ?? [] });
    }

    if (["backup_verify", "backup_download", "backup_delete", "backup_restore", "backup_inspect"].includes(action)) {
      requireAdmin();
      const id = String(body.backup_id ?? "");
      // Tenant scope is enforced in the query itself: a backup of another tenant is simply not found.
      const { data: bk } = await admin.from("data_backups").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      if (!bk) return json({ error: "Copia de seguridad no encontrada para este negocio" }, 404);

      if (action === "backup_delete") {
        if (bk.storage_path) await admin.storage.from("tenant-backups").remove([bk.storage_path as string]);
        await admin.from("data_backups").delete().eq("id", id).eq("tenant_id", tenantId);
        await logAudit(admin, { tenantId, userId: caller.id, action: "BULK_DELETE", entityId: id, description: `Copia de seguridad eliminada: ${bk.label}` });
        return json({ deleted: true });
      }

      if (action === "backup_download") {
        const { data: signed, error } = await admin.storage.from("tenant-backups")
          .createSignedUrl(bk.storage_path as string, 120, { download: `${bk.label}.maria.json` });
        if (error) return json({ error: error.message }, 500);
        await logAudit(admin, { tenantId, userId: caller.id, action: "BACKUP_DOWNLOADED", entityId: id, description: `Descarga de copia ${bk.label}` });
        return json({ url: signed.signedUrl, checksum: bk.checksum });
      }

      const { data: file, error: dlErr } = await admin.storage.from("tenant-backups").download(bk.storage_path as string);
      if (dlErr || !file) return json({ error: "No se pudo leer el archivo de la copia" }, 500);
      const text = await file.text();
      const checksum = await sha256(text);
      const valid = checksum === bk.checksum;

      if (action === "backup_verify") {
        await admin.from("data_backups").update({ verified_at: new Date().toISOString(), status: valid ? "completed" : "corrupt" }).eq("id", id);
        await logAudit(admin, { tenantId, userId: caller.id, action: "BACKUP_VERIFIED", entityId: id, description: `Verificación de integridad: ${valid ? "correcta" : "FALLIDA"}`, metadata: { checksum, expected: bk.checksum } });
        return json({ valid, checksum, expected: bk.checksum, record_count: bk.record_count });
      }

      // ---------------- INSPECT (read-only preview of the package) ----------------
      if (action === "backup_inspect") {
        let pkgIn: any = null;
        try { pkgIn = JSON.parse(text); } catch { return json({ error: "Paquete ilegible" }, 422); }
        const pkgTenantIn = pkgIn?.manifest?.tenant_id ?? null;
        const dataIn: Record<string, unknown[]> = pkgIn?.data ?? {};
        const entityKeys = Object.keys(dataIn).filter((k) => BACKUP_ENTITIES.includes(k as EntityKey));
        const contents = entityKeys.map((k) => ({
          entity: k, label: ENTITIES[k as EntityKey].label, count: (dataIn[k] ?? []).length,
        }));
        const focus = typeof body.entity === "string" && entityKeys.includes(body.entity) ? body.entity : entityKeys[0];
        const search = String(body.search ?? "").trim().toLowerCase();
        const page = Math.max(0, Number(body.page ?? 0));
        const size = Math.min(50, Math.max(5, Number(body.page_size ?? 20)));
        let sample: Record<string, unknown>[] = focus ? ((dataIn[focus] ?? []) as Record<string, unknown>[]) : [];
        if (search) {
          sample = sample.filter((r) => Object.values(r).some((val) => String(val ?? "").toLowerCase().includes(search)));
        }
        const matched = sample.length;
        const cols = focus ? ["id", ...ENTITIES[focus as EntityKey].columns] : [];
        const rows = sample.slice(page * size, page * size + size).map((r) => {
          const o: Record<string, unknown> = {};
          for (const c of cols) o[c] = (r as any)[c] ?? null;
          return o;
        });
        return json({
          manifest: pkgIn?.manifest ?? null,
          tenant_matches: !pkgTenantIn || pkgTenantIn === tenantId,
          checksum_valid: valid,
          checksum, expected: bk.checksum,
          schema_compatible: !pkgIn?.manifest?.schema_version || pkgIn.manifest.schema_version === SCHEMA_VERSION,
          schema_version: pkgIn?.manifest?.schema_version ?? null,
          current_schema_version: SCHEMA_VERSION,
          record_count: bk.record_count, size_bytes: bk.size_bytes, label: bk.label,
          kind: bk.kind, scope: bk.scope, created_at: bk.created_at,
          contents, focus, columns: cols, rows, matched, page, page_size: size,
        });
      }



      // ---------------- RESTORE ----------------
      if (!valid) return json({ error: "La copia está corrupta (checksum no coincide). Restauración abortada." }, 422);
      let pkg: any;
      try { pkg = JSON.parse(text); } catch { return json({ error: "Paquete ilegible" }, 422); }
      const pkgTenant = pkg?.manifest?.tenant_id ?? null;
      if (pkgTenant && pkgTenant !== tenantId) return json({ error: "La copia pertenece a otro negocio" }, 403);
      if (pkg?.manifest?.schema_version && pkg.manifest.schema_version !== SCHEMA_VERSION) {
        return json({ error: `Versión de esquema incompatible (${pkg.manifest.schema_version})` }, 422);
      }
      const requestedEntities: EntityKey[] = Array.isArray(body.entities) && body.entities.length
        ? body.entities.filter((e: string) => BACKUP_ENTITIES.includes(e as EntityKey))
        : (Object.keys(pkg.data ?? { [pkg.entity]: pkg.rows }) as EntityKey[]);

      const { data: op } = await admin.from("data_operations").insert({
        tenant_id: tenantId, kind: "restore", status: "processing", created_by: caller.id,
        restore_point_id: id, summary: { entities: requestedEntities },
      }).select("*").single();
      await logAudit(admin, { tenantId, userId: caller.id, action: "RESTORE_STARTED", entityId: op?.id ?? id, description: `Restauración desde ${bk.label}`, metadata: { entities: requestedEntities } });

      // Safety net: snapshot the current state before overwriting anything.
      const currentData: Record<string, unknown[]> = {};
      let currentCount = 0;
      for (const key of requestedEntities) {
        const rows = await fetchAll(admin, ENTITIES[key].table, tenantId);
        currentData[key] = rows; currentCount += rows.length;
      }
      const safetyPayload = JSON.stringify({
        manifest: { format: "maria-package", package_version: "1.0", schema_version: SCHEMA_VERSION, tenant_id: tenantId, created_at: new Date().toISOString(), created_by: caller.id, export_type: "partial", entities: requestedEntities, record_count: currentCount },
        data: currentData,
      });
      const safetyChecksum = await sha256(safetyPayload);
      const { data: safety } = await admin.from("data_backups").insert({
        tenant_id: tenantId, label: `Estado previo a restaurar ${bk.label}`, kind: "pre_operation",
        scope: "partial", entities: requestedEntities, size_bytes: safetyPayload.length, record_count: currentCount,
        checksum: safetyChecksum, schema_version: SCHEMA_VERSION, status: "completed", created_by: caller.id,
      }).select("id").single();
      if (safety) {
        const p = `${tenantId}/${safety.id}.maria.json`;
        await admin.storage.from("tenant-backups").upload(p, new Blob([safetyPayload], { type: "application/json" }), { upsert: true });
        await admin.from("data_backups").update({ storage_path: p }).eq("id", safety.id);
      }

      let restored = 0;
      try {
        for (const key of requestedEntities) {
          const def = ENTITIES[key];
          const rows: Record<string, unknown>[] = (pkg.data?.[key] ?? (pkg.entity === key ? pkg.rows : [])) ?? [];
          for (let i = 0; i < rows.length; i += 200) {
            const batch = rows.slice(i, i + 200).map((r) => ({ ...r, tenant_id: tenantId }));
            const { error } = await admin.from(def.table).upsert(batch, { onConflict: "id" });
            if (error) throw new Error(`${def.table}: ${error.message}`);
            restored += batch.length;
          }
        }
      } catch (e) {
        await admin.from("data_operations").update({ status: "failed", error: (e as Error).message, total_rows: restored, finished_at: new Date().toISOString() }).eq("id", op?.id);
        await logAudit(admin, { tenantId, userId: caller.id, action: "RESTORE_FAILED", entityId: op?.id ?? id, description: `Restauración fallida: ${(e as Error).message}` });
        return json({ error: (e as Error).message, safety_backup_id: safety?.id }, 500);
      }

      await admin.from("data_operations").update({ status: "completed", total_rows: restored, updated_count: restored, finished_at: new Date().toISOString(), reversible: !!safety, restore_point_id: safety?.id ?? id }).eq("id", op?.id);
      await logAudit(admin, { tenantId, userId: caller.id, action: "BACKUP_RESTORED", entityId: id, description: `Restauración completada (${restored} registros)`, metadata: { entities: requestedEntities, restored, safety_backup_id: safety?.id } });
      await logAudit(admin, { tenantId, userId: caller.id, action: "RESTORE_COMPLETED", entityId: op?.id ?? id, description: `Restauración completada desde ${bk.label}` });
      return json({ restored, entities: requestedEntities, safety_backup_id: safety?.id });
    }

    // ============================== CLONE ==============================
    if (action === "clone_preview") {
      requireAdmin();
      const counts: Record<string, number> = {};
      for (const key of CLONEABLE_ENTITIES) {
        const { count } = await admin.from(ENTITIES[key].table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
        counts[key] = count ?? 0;
      }
      const { data: targets } = isSA
        ? await admin.from("tenants").select("id, name, business_type").eq("is_active", true).order("name")
        : await admin.from("tenants").select("id, name, business_type").in("id", myTenants).eq("is_active", true).order("name");
      return json({ counts, cloneable: CLONEABLE_ENTITIES, targets: targets ?? [], excluded: ["ventas", "movimientos financieros", "turnos de caja", "credenciales", "tokens", "auditoría histórica"] });
    }

    if (action === "clone") {
      requireAdmin();
      const target = String(body.target_tenant_id ?? "");
      if (!target || target === tenantId) return json({ error: "Negocio destino inválido" }, 400);
      // The caller must be authorised on BOTH sides.
      if (!isSA && !myTenants.includes(target)) return json({ error: "Acceso denegado al negocio destino" }, 403);
      const entities: EntityKey[] = (Array.isArray(body.entities) ? body.entities : CLONEABLE_ENTITIES)
        .filter((e: string) => CLONEABLE_ENTITIES.includes(e as EntityKey));

      const { data: op } = await admin.from("data_operations").insert({
        tenant_id: tenantId, kind: "clone", status: "processing", created_by: caller.id,
        summary: { target_tenant_id: target, entities },
      }).select("*").single();

      let copied = 0;
      try {
        for (const key of entities) {
          const def = ENTITIES[key];
          // Relational entities reference ids that do not exist in the target: skip them.
          if (def.columns.some((c) => c.endsWith("_id"))) continue;
          const rows = await fetchAll(admin, def.table, tenantId);
          const clean = rows.map((r) => {
            const o: Record<string, unknown> = { tenant_id: target };
            for (const c of def.columns) o[c] = r[c] ?? null;
            return o;
          });
          for (let i = 0; i < clean.length; i += 200) {
            const { error } = await admin.from(def.table).insert(clean.slice(i, i + 200));
            if (error) throw new Error(`${def.table}: ${error.message}`);
            copied += Math.min(200, clean.length - i);
          }
        }
      } catch (e) {
        await admin.from("data_operations").update({ status: "failed", error: (e as Error).message, finished_at: new Date().toISOString() }).eq("id", op?.id);
        return json({ error: (e as Error).message, copied }, 500);
      }
      await admin.from("data_operations").update({ status: "completed", created_count: copied, total_rows: copied, finished_at: new Date().toISOString() }).eq("id", op?.id);
      await logAudit(admin, { tenantId, userId: caller.id, action: "TENANT_CLONED", entityId: target, description: `Clonación de datos maestros hacia otro negocio (${copied} registros)`, metadata: { target_tenant_id: target, entities, copied } });
      return json({ copied, entities, target_tenant_id: target });
    }

    // ============================== HISTORY ==============================
    if (action === "history") {
      if (!canExport) return json({ error: "Sin permiso" }, 403);
      const { data } = await admin.from("data_operations").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
      return json({ operations: data ?? [] });
    }

    return json({ error: `Acción no soportada: ${action}` }, 400);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return json({ error: (e as Error).message }, status);
  }
});
