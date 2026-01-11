import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface RedirectStep {
  url: string;
  status: number;
  params?: Record<string, string>;
  redirect_type: 'http' | 'meta' | 'javascript' | 'final' | 'error';
  method: string;
  headers?: Record<string, string>;
  html_snippet?: string;
  error?: string;
  timing_ms?: number;
}

export interface TraceResult {
  success: boolean;
  chain: RedirectStep[];
  total_steps: number;
  total_timing_ms: number;
  final_url: string;
  proxy_used: boolean;
  user_agent?: string;
  error?: string;
}

export interface Offer {
  id: string;
  user_id: string;
  offer_name: string;
  final_url: string;
  tracking_template: string | null;
  suffix_pattern: string;
  target_geo: string;
  target_country: string | null;
  custom_referrer: string;
  redirect_chain_step: number;
  last_traced_chain: RedirectStep[] | null;
  last_trace_date: string | null;
  is_active: boolean;
  extract_from_location_header?: boolean;
  location_extract_hop?: number | null;
  created_at: string;
  updated_at: string;
}

export interface SuffixRequest {
  id: string;
  offer_id: string;
  requested_at: string;
  suffix_returned: string;
  ip_address: string | null;
  user_agent: string | null;
  params?: Record<string, string> | null;
  proxy_ip?: string | null;
}

export interface OfferStatistics {
  id: string;
  offer_id: string;
  total_suffix_requests: number;
  total_tracking_hits: number;
  last_request_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UrlTrace {
  id: string;
  offer_id: string;
  visitor_ip: string;
  user_agent: string;
  referrer: string;
  country: string;
  city: string;
  device_type: string;
  visited_at: string;
  final_url: string;
  query_params: Record<string, string>;
  proxy_ip?: string | null;
  geo_country?: string | null;
  geo_city?: string | null;
  geo_region?: string | null;
  geo_data?: any;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
  created_at: string;
  updated_at: string;
}
