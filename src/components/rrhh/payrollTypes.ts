export interface PayrollRow {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  base_salary: number;
  hours_worked: number;
  bonus: number;
  deductions: number;
  gross_salary?: number | null;
  other_deductions?: number | null;
  overtime_amount?: number | null;
  net_pay: number;
  status: string;
  paid_at: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  receipt_number?: string | null;
  notes?: string | null;
  payment_method?: string | null;
  employees?: { name: string; position?: string | null; department?: string | null; document_id?: string | null } | null;
}

export const PAYROLL_STATUS_LABEL: Record<string, string> = {
  pending: "Generada",
  approved: "Aprobada",
  paid: "Pagada",
  cancelled: "Anulada",
};

export interface PayrollSignature {
  id: string;
  payroll_id: string;
  signer_name: string;
  method: string;
  evidence_url: string | null;
  notes: string | null;
  signed_at: string;
}

export interface PayrollEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  metadata: any;
  actor_label: string | null;
  created_at: string;
}

export const PAYROLL_EVENT_LABEL: Record<string, string> = {
  payroll_created: "Nómina generada",
  status_changed: "Cambio de estado",
  payroll_edited: "Importes modificados",
  payroll_recomputed: "Recalculada",
  payroll_unapproved: "Aprobación retirada",
  payroll_cancelled: "Anulada",
  payment_reverted: "Pago revertido",
  payroll_duplicated: "Duplicada",
  signature_registered: "Firma registrada",
};
