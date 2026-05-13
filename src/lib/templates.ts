/**
 * templates.ts — Service layer for MicroBuild template data.
 *
 * Fetches from Supabase with a silent fallback to mock data if:
 *   - Supabase is not configured (env vars missing)
 *   - The query returns an error (network, RLS, etc.)
 *   - The query returns an empty result set
 *
 * This lets the app render correctly in development without a live
 * Supabase connection, and degrades gracefully in production.
 */

import { supabase } from './supabase';
import { mockListings } from '../data/mockListings';
import type { MicroBuildListing, MicroBuildCategory, BuildStatus } from '../types';
import type { MicroBuildTemplateRow } from '../types/database';

// The shape returned when joining microbuild_categories into the template row
type TemplateWithCategory = MicroBuildTemplateRow & {
  microbuild_categories: { name: string } | null;
};

/** Map a snake_case database row → camelCase MicroBuildListing. */
function rowToListing(row: TemplateWithCategory): MicroBuildListing {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    category: (row.microbuild_categories?.name ?? 'Quote Funnel') as MicroBuildCategory,
    targetIndustry: row.target_industry,
    mainGoal: row.main_goal,
    startingPrice: row.starting_price,
    estimatedTurnaround: row.estimated_turnaround,
    description: row.description,
    features: row.features,
    setupRequirements: row.setup_requirements,
    status: row.status as BuildStatus,
  };
}

/**
 * Fetch all active templates.
 * Falls back to mockListings on any error or empty result.
 * Returns { listings, fromSupabase } so callers can show a data-source indicator.
 */
export async function fetchTemplates(): Promise<{
  listings: MicroBuildListing[];
  fromSupabase: boolean;
}> {
  try {
    const { data, error } = await supabase
      .from('microbuild_templates')
      .select('*, microbuild_categories(name)')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      return { listings: mockListings, fromSupabase: false };
    }

    return {
      listings: (data as unknown as TemplateWithCategory[]).map(rowToListing),
      fromSupabase: true,
    };
  } catch {
    return { listings: mockListings, fromSupabase: false };
  }
}

/**
 * Fetch a single template by slug.
 * Falls back to mock data first, then returns null if not found anywhere.
 */
export async function fetchTemplateBySlug(slug: string): Promise<{
  listing: MicroBuildListing | null;
  fromSupabase: boolean;
}> {
  try {
    const { data, error } = await supabase
      .from('microbuild_templates')
      .select('*, microbuild_categories(name)')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (!error && data) {
      return {
        listing: rowToListing(data as unknown as TemplateWithCategory),
        fromSupabase: true,
      };
    }
  } catch {
    // fall through to mock
  }

  // Mock fallback
  const mock = mockListings.find((l) => l.slug === slug) ?? null;
  return { listing: mock, fromSupabase: false };
}
