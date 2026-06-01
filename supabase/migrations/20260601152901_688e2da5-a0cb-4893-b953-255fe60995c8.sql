-- 1) Seed job_positions per tenant from existing employee.position values
WITH src AS (
  SELECT
    e.tenant_id,
    e.position AS name,
    ROUND(AVG(NULLIF(e.salary, 0))::numeric, 2) AS avg_salary
  FROM public.employees e
  WHERE e.position IS NOT NULL AND length(trim(e.position)) > 0
  GROUP BY e.tenant_id, e.position
)
INSERT INTO public.job_positions (tenant_id, code, name, department, level, base_salary, min_salary, max_salary, description, is_active)
SELECT
  s.tenant_id,
  upper(regexp_replace(translate(s.name, 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN'), '[^a-zA-Z0-9]+', '-', 'g')) AS code,
  s.name,
  CASE
    WHEN s.name ILIKE '%chef%' OR s.name ILIKE '%cocin%' THEN 'Cocina'
    WHEN s.name ILIKE '%mesero%' OR s.name ILIKE '%mesera%' OR s.name ILIKE '%hostess%' OR s.name ILIKE '%bartender%' THEN 'Salón'
    WHEN s.name ILIKE '%cajer%' THEN 'Caja'
    WHEN s.name ILIKE '%vended%' OR s.name ILIKE '%encargad%' THEN 'Ventas'
    WHEN s.name ILIKE '%almac%' OR s.name ILIKE '%t%cnico%' THEN 'Operaciones'
    WHEN s.name ILIKE '%contad%' THEN 'Administración'
    WHEN s.name ILIKE '%segur%' THEN 'Seguridad'
    ELSE 'General'
  END AS department,
  CASE
    WHEN s.name ILIKE '%chef ejecutivo%' OR s.name ILIKE '%chef principal%' OR s.name ILIKE '%encargad%' THEN 'lead'
    WHEN s.name ILIKE '%sous%' OR s.name ILIKE '%contad%' THEN 'senior'
    ELSE 'junior'
  END AS level,
  COALESCE(s.avg_salary, 0),
  ROUND(COALESCE(s.avg_salary, 0) * 0.85, 2),
  ROUND(COALESCE(s.avg_salary, 0) * 1.25, 2),
  'Puesto generado automáticamente a partir de los empleados existentes.',
  true
FROM src s
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 2) Link employees to their matching job_position by exact name within tenant
UPDATE public.employees e
SET position_id = jp.id
FROM public.job_positions jp
WHERE jp.tenant_id = e.tenant_id
  AND jp.name = e.position
  AND e.position_id IS NULL;

-- 3) Remove example payrolls + their accounts payable (they were created without position context)
DELETE FROM public.accounts_payable
WHERE source_type = 'payroll'
  AND source_id IN (SELECT id FROM public.payroll_runs);

DELETE FROM public.payroll_runs;