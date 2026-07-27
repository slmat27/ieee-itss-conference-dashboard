// Conference domain types for IEEE ITSS Conference Dashboard

export interface Milestone {
  id: string;
  conference_id: string;
  milestone_type: string;
  display_name: string;
  code?: string;
  name?: string;
  dimension?: string;
  description?: string | null;
  planned_date?: string | null;
  actual_date?: string | null;
  calculated_date?: string | null;
  status: string;
  due_date?: string | null;
  completed_date?: string | null;
  manual_override?: boolean;
  comments?: string | null;
  last_updated?: string;
  due_date_source?: string | null;
  responsible_party?: string | null;
  notes?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  conference_id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  organization?: string | null;
  phone?: string | null;
  is_primary: boolean;
  active?: boolean;
  notes?: string | null;
}

export interface Comment {
  id: string;
  conference_id: string;
  author: string;
  text?: string;
  comment?: string;
  created_at: string;
  updated_at?: string;
}

export interface Issue {
  id: string;
  conference_id: string;
  conference_name?: string | null;
  issue_key?: string;
  title?: string;
  description: string;
  severity: string;
  status?: string;
  issue_status?: string;
  category?: string | null;
  review_assessment?: string | null;
  source_type?: string | null;
  owner?: string | null;
  created_by?: string | null;
  created_at: string;
  date_detected?: string;
  due_date?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  conference_acronym?: string;
  conference_year?: number;
}

export interface Conference {
  id: string;
  conference_number?: string | null;
  acronym: string;
  year: number;
  official_title: string;
  canonical_name: string;
  conference_series: string;
  conference_category?: string;
  sponsorship_type: string;
  lifecycle_phase: string;
  suggested_phase: string;
  phase_override: boolean;
  phase_differs: boolean;
  conference_status: string;
  start_date?: string | null;
  end_date?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  estimated_attendees?: number | null;
  actual_attendees?: number | null;
  last_source_update?: string | null;
  last_reviewed_date?: string | null;
  comments?: string | null;
  application_status?: string;
  application_status_raw?: string | null;
  mou_status?: string;
  mou_status_raw?: string | null;
  finance_status?: string;
  financial_analyst?: string | null;
  committee_contact?: string | null;
  currency?: string | null;
  total_income_current?: number | null;
  total_expense_current?: number | null;
  budgeted_income_total?: number | null;
  budgeted_expense_total?: number | null;
  itss_loan_requested?: boolean;
  itss_loan_amount?: number | null;
  accounting_close_date?: string | null;
  accounting_close_timeliness?: DateTimeliness;
  publication_status?: string;
  proceedings_submitted_date?: string | null;
  xplore_posting_date?: string | null;
  publication_timeliness?: DateTimeliness;
  score: number;
  base_score: number;
  issue_penalty: number;
  data_completeness: number;
  status_band: string;
  open_issue_count: number;
  milestones: Milestone[];
  contacts: Contact[];
  comments_history?: Comment[];
  source_details?: Record<string, any>;
  score_details?: any;
}

export interface ConferenceSummary {
  conference_count: number;
  open_issue_count: number;
  average_score: number;
  average_surplus_percentage: number;
  actual_surplus_conference_count: number;
  kpi_from_year: number;
  kpi_to_year: number;
  status_counts: Record<string, number>;
  health_counts?: Record<string, number>;
  phase_counts: Record<string, number>;
  flagship_cards: any[];
  flagship_groups: any[];
  azure_openai: any;
}

export interface FinanceSnapshot {
  id: string;
  conference_id: string;
  snapshot_date: string;
  total_income?: number | null;
  total_expense?: number | null;
  surplus_deficit?: number | null;
  surplus_percentage?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface ReferenceData {
  committee_members: string[];
  lifecycle_phases: { name: string; display_name: string; description: string }[];
  conference_series: { code: string; name: string; flagship: boolean }[];
  sponsorship_types: string[];
  conference_categories: string[];
  milestone_templates: { milestone_type: string; display_name: string; description: string; default_offset_days: number; phase_applicability: string[] }[];
  severity_levels: string[];
  issue_categories: string[];
  currency_options: string[];
}

export interface AppSettings {
  azure_openai?: Record<string, any>;
  embeddings?: Record<string, any>;
  score_weights?: Record<string, number>;
  portfolio_start_year?: number;
  kpi_from_year?: number;
  kpi_to_year?: number;
  kpi_available_years?: number[];
  status_mappings?: Record<string, string>;
  milestone_date_defaults: Record<string, any>;
  score_settings: Record<string, any>;
  feature_flags: Record<string, boolean>;
  role_permissions?: Record<string, Record<string, boolean>>;
  roles?: { key: string; label: string; description: string }[];
  permission_catalog?: { key: string; label: string; description: string }[];
  assistant_system_prompt?: string;
  reference_config?: Record<string, any[]>;
  reference_config_labels?: Record<string, string>;
  llm_config: Record<string, any>;
}

export interface DateTimeliness {
  state: "on_time" | "pending" | "warning" | "late" | "unknown";
  label: string;
  due_date?: string | null;
  days_from_due?: number | null;
  warning_days: number;
}

export interface Document {
  id: string;
  title: string;
  file_name: string;
  document_category: string;
  knowledge_scope: string;
  conference_id?: string | null;
  conference_series?: string | null;
  version?: string | null;
  source_url?: string | null;
  upload_date: string;
  active: boolean;
  extraction_state: string;
  indexing_state: string;
  page_count: number;
  chunk_count: number;
  embedding?: Record<string, any>;
}

export interface Template {
  id: string;
  template_name: string;
  short_description?: string | null;
  category: string;
  template_type: string;
  original_filename: string;
  last_update: string;
  upload_date: string;
}

export interface EmailDraft {
  id: string;
  conference_id?: string | null;
  conference_acronym?: string;
  conference_year?: number;
  recipient_names?: string | null;
  recipient_addresses?: string | null;
  cc_addresses?: string | null;
  subject: string;
  body: string;
  tone?: string | null;
  generator?: string | null;
  created_at: string;
}
