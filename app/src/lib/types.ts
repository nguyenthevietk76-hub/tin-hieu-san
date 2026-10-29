export type Band = "very_high" | "high" | "medium" | "low";

export interface Company {
  t: string;
  name: string;
  ex: string;
  ind1: string;
  ind2: string;
  ind3: string;
  y0: number;
  y1: number;
  listed: boolean;
  status: string | null;
  n_ev: number;
  n_lab: number;
  last_ev: string | null;
  y1_years: number;
  y2_years: number;
  reports: number;
  p1?: number;
  p2?: number;
  pct1?: number;
  pct2?: number;
  band1?: Band;
  band2?: Band;
  prev1?: number | null;
  prev2?: number | null;
}

export interface EventRec {
  id: string;
  t: string;
  d: string;
  ag: string;
  m: string;
  dir: string;
  e: string;
  why: string | null;
  law: string | null;
  doc: string | null;
  title: string;
  urls: string[];
  name?: string | null;
  in?: number;
}

export type Drivers = Record<string, number>;

export interface FirmYear {
  fiscal_year: number;
  exchange: string;
  origin: string | null;
  pub_date: string | null;
  pub_delay: number | null;
  has_pdf: boolean;
  pdf_type: string | null;
  n_pages: number | null;
  ocr_share: number | null;
  pdf_source: string | null;
  n_words: number | null;
  n_sections: number | null;
  txt_neg: number | null;
  txt_unc: number | null;
  txt_pos: number | null;
  top_neg: Record<string, number>;
  ev_comp_3y: number;
  ev_perf_3y: number;
  ev_any_1y: number;
  prior_status: number;
  Y1: number;
  Y2: number;
  Y_all: number;
  [k: `n_E${number}`]: number;
  p_Y1: number | null;
  p_Y2: number | null;
  pct_Y1: number | null;
  pct_Y2: number | null;
  drivers_Y1?: Drivers;
  drivers_Y2?: Drivers;
  x: Drivers;
}

export interface CompanyDetail {
  info: Company;
  years: FirmYear[];
  events: EventRec[];
  fin: Array<Record<string, number | string | null>>;
  live?: { as_of: string; x: Drivers; drivers_Y1: Drivers; drivers_Y2: Drivers };
  delist?: { last_trade?: string; delist_from?: string; delist_title?: string; delist_url?: string };
}

export interface Metrics {
  n: number;
  pos: number;
  base_rate?: number;
  auc?: number;
  pr_auc?: number;
  top10_precision?: number;
  top10_lift?: number;
  top10_recall?: number;
}

export interface Meta {
  generated_at: string;
  as_of: string;
  counts: {
    firm_years: number;
    tickers: number;
    events: number;
    events_labelled: number;
    reports: number;
    listed_now: number;
    years: [number, number];
    fin_rows: number;
  };
  e_def: Record<string, string>;
  features: Record<string, string>;
  model: Record<"Y1" | "Y2", { oos: Metrics; per_year: Record<string, Metrics>; coef: Record<string, number>; intercept: number }>;
  lexicon: Record<string, string[]>;
}

export interface Stats {
  events_by_year: Array<Record<string, number>>;
  events_by_measure: Record<string, number>;
  events_by_agency: Record<string, number>;
  coverage: Array<{ fiscal_year: number; exchange: string; n: number; pdf: number }>;
  labels_by_year: Array<{ fiscal_year: number; n: number; y1: number; y2: number; yall: number; prior: number }>;
  industry: Array<{ industry_l1: string; n: number; firms: number; y1: number; y2: number; yall: number }>;
  industry_year: Array<{ industry_l1: string; fiscal_year: number; Y_all: number }>;
  pdf_types: Record<string, number>;
  pub_delay_median: Array<{ fiscal_year: number; pub_delay: number }>;
  special_now: Record<string, number>;
}
