import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Dataset, BusinessContext, KPIMetric, ChartConfig } from '../types';

export const SUPABASE_CONFIG = {
  projectName: "HunTer-ai124's Project",
  projectId: 'tugtkiitaiczevejyevp',
  supabaseUrl: 'https://tugtkiitaiczevejyevp.supabase.co',
  restUrl: 'https://tugtkiitaiczevejyevp.supabase.co/rest/v1/',
  publicKey: 'sb_publishable_Xuri0TnTocafMZ36MDIAFQ_7U_VaYfI',
  tableName: 'insightlab_datasets',
};

// Initialize Supabase client
export const supabase: SupabaseClient = createClient(
  SUPABASE_CONFIG.supabaseUrl,
  SUPABASE_CONFIG.publicKey
);

export interface SupabaseSyncResult {
  success: boolean;
  message: string;
  tableExists: boolean;
  schemaSql?: string;
  data?: any;
  error?: string;
}

/**
 * Returns the exact PostgreSQL SQL script to create tables in Supabase SQL editor
 */
export function getSupabaseSchemaSql(): string {
  return `-- ====================================================================
-- InsightLab AI Analytics Table Schema for HunTer-ai124's Project
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/tugtkiitaiczevejyevp/sql
-- ====================================================================

-- 1. Create the main datasets storage table
CREATE TABLE IF NOT EXISTS public.insightlab_datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_name TEXT,
  row_count INTEGER NOT NULL,
  column_count INTEGER NOT NULL,
  columns JSONB NOT NULL,
  sample_rows JSONB,
  business_problem TEXT,
  business_objectives TEXT,
  kpis JSONB,
  charts JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.insightlab_datasets ENABLE ROW LEVEL SECURITY;

-- 3. Allow anonymous/public read, insert, and update using publishable key
DROP POLICY IF EXISTS "Allow anonymous read" ON public.insightlab_datasets;
CREATE POLICY "Allow anonymous read" 
ON public.insightlab_datasets 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Allow anonymous insert" ON public.insightlab_datasets;
CREATE POLICY "Allow anonymous insert" 
ON public.insightlab_datasets 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous update" ON public.insightlab_datasets;
CREATE POLICY "Allow anonymous update" 
ON public.insightlab_datasets 
FOR UPDATE 
USING (true);

-- 4. Enable Realtime broadcasting (optional)
ALTER PUBLICATION supabase_realtime ADD TABLE public.insightlab_datasets;
`;
}

/**
 * Test connectivity to the user's Supabase project
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  tableExists: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from(SUPABASE_CONFIG.tableName)
      .select('id')
      .limit(1);

    if (error) {
      if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
        // Connected to Supabase, but the table hasn't been created in public schema yet
        return { connected: true, tableExists: false };
      }
      return { connected: false, tableExists: false, error: error.message };
    }

    return { connected: true, tableExists: true };
  } catch (err: any) {
    return { connected: false, tableExists: false, error: err.message || 'Connection failed' };
  }
}

/**
 * Store dataset metadata, schema, KPIs, and charts in Supabase
 */
export async function storeDatasetInSupabase(
  dataset: Dataset,
  businessContext: BusinessContext,
  kpis: KPIMetric[] = [],
  charts: ChartConfig[] = []
): Promise<SupabaseSyncResult> {
  const schemaSql = getSupabaseSchemaSql();

  try {
    const payload = {
      id: dataset.id,
      name: dataset.name,
      file_name: dataset.fileName,
      row_count: dataset.cleanedRows.length,
      column_count: dataset.columns.length,
      columns: dataset.columns,
      sample_rows: dataset.cleanedRows.slice(0, 50), // Store top 50 sample rows for fast preview
      business_problem: businessContext.problem || null,
      business_objectives: businessContext.objectives || null,
      kpis: kpis.map((k) => ({
        id: k.id,
        title: k.title,
        sql: k.sql,
        format: k.format,
        insight: k.insight,
        calculatedValue: k.calculatedValue,
      })),
      charts: charts.map((c) => ({
        id: c.id,
        title: c.title,
        chartType: c.chartType,
        sql: c.sql,
        xKey: c.xKey,
        yKeys: c.yKeys,
        caption: c.caption,
      })),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from(SUPABASE_CONFIG.tableName)
      .upsert(payload, { onConflict: 'id' })
      .select();

    if (error) {
      if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
        return {
          success: false,
          tableExists: false,
          message: `Connected to HunTer-ai124's Project! The table "${SUPABASE_CONFIG.tableName}" does not exist yet. Run the SQL schema script in your Supabase SQL Editor.`,
          schemaSql,
          error: error.message,
        };
      }
      return {
        success: false,
        tableExists: true,
        message: `Supabase Error: ${error.message}`,
        error: error.message,
      };
    }

    return {
      success: true,
      tableExists: true,
      message: `Dataset "${dataset.name}" successfully stored in HunTer-ai124's Supabase project!`,
      data,
    };
  } catch (err: any) {
    return {
      success: false,
      tableExists: false,
      message: err.message || 'Failed to sync with Supabase',
      schemaSql,
      error: err.message,
    };
  }
}

/**
 * Fetch all saved datasets from Supabase
 */
export async function fetchDatasetsFromSupabase(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from(SUPABASE_CONFIG.tableName)
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('Error fetching from Supabase:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('Supabase fetch exception:', err);
    return [];
  }
}

/**
 * Generate full SQL INSERT statements for all rows in the dataset
 * so the user can import every row directly into Supabase
 */
export function generateDatasetSqlDump(dataset: Dataset): string {
  const tableName = dataset.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const cols = dataset.columns.map((c) => {
    let pgType = 'TEXT';
    if (c.type === 'number') pgType = 'NUMERIC';
    if (c.type === 'currency') pgType = 'NUMERIC';
    if (c.type === 'date') pgType = 'TIMESTAMP';
    if (c.type === 'boolean') pgType = 'BOOLEAN';
    return `  "${c.name}" ${pgType}`;
  });

  const createTable = `CREATE TABLE IF NOT EXISTS public."${tableName}" (\n  id SERIAL PRIMARY KEY,\n${cols.join(',\n')}\n);\n`;

  const insertStatements: string[] = [];
  const chunkSize = 100;
  const rows = dataset.cleanedRows;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valueRows = chunk.map((row) => {
      const vals = dataset.columns.map((col) => {
        const val = row[col.name];
        if (val === null || val === undefined || val === '') return 'NULL';
        if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        return `'${String(val).replace(/'/g, "''")}'`;
      });
      return `(${vals.join(', ')})`;
    });

    const colNames = dataset.columns.map((c) => `"${c.name}"`).join(', ');
    insertStatements.push(
      `INSERT INTO public."${tableName}" (${colNames})\nVALUES\n  ${valueRows.join(',\n  ')};`
    );
  }

  return `-- Dataset SQL Export for Supabase (${rows.length} rows, ${dataset.columns.length} columns)\n-- Target Table: public."${tableName}"\n\n${createTable}\n${insertStatements.join('\n\n')}\n`;
}
