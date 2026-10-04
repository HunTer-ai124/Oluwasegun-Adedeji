import { ColumnMetadata } from '../types';

export interface ColumnSummaryItem {
  name: string;
  type: string;
  sampleValues: any[];
  uniqueCount: number;
}

export function extractColumnSummaries(columns: ColumnMetadata[]): ColumnSummaryItem[] {
  return columns.map((col) => ({
    name: col.name,
    type: col.type,
    sampleValues: col.sampleValues || [],
    uniqueCount: col.uniqueCount,
  }));
}

export async function generateDashboardSetup(params: {
  problem: string;
  objectives: string;
  columns: ColumnMetadata[];
  rowCount: number;
  tableName?: string;
}) {
  const schema = extractColumnSummaries(params.columns);
  const res = await fetch('/api/ai/generate-dashboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problem: params.problem,
      objectives: params.objectives,
      schema,
      rowCount: params.rowCount,
      tableName: params.tableName || 'dataset',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with ${res.status}`);
  }

  const result = await res.json();
  return result.data;
}

export async function generateSqlFromText(params: {
  question: string;
  columns: ColumnMetadata[];
  problem?: string;
  objectives?: string;
  tableName?: string;
}) {
  const schema = extractColumnSummaries(params.columns);
  const res = await fetch('/api/ai/text-to-sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: params.question,
      schema,
      problem: params.problem,
      objectives: params.objectives,
      tableName: params.tableName || 'dataset',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with ${res.status}`);
  }

  const result = await res.json();
  return result.data;
}

export async function chatAgentGenerateSql(params: {
  message: string;
  history: { role: string; content: string }[];
  columns: ColumnMetadata[];
  problem?: string;
  objectives?: string;
  tableName?: string;
}) {
  const schema = extractColumnSummaries(params.columns);
  const res = await fetch('/api/ai/chat-generate-sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.message,
      history: params.history,
      schema,
      problem: params.problem,
      objectives: params.objectives,
      tableName: params.tableName || 'dataset',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with ${res.status}`);
  }

  const result = await res.json();
  return result.data;
}

export async function chatAgentSynthesize(params: {
  message: string;
  sql?: string;
  queryResults?: any[];
  problem?: string;
  objectives?: string;
}) {
  const res = await fetch('/api/ai/chat-synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.message,
      sql: params.sql,
      queryResults: params.queryResults,
      problem: params.problem,
      objectives: params.objectives,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with ${res.status}`);
  }

  const result = await res.json();
  return result.data;
}

export async function createCustomChart(params: {
  chartPrompt: string;
  columns: ColumnMetadata[];
  problem?: string;
  objectives?: string;
  tableName?: string;
}) {
  const schema = extractColumnSummaries(params.columns);
  const res = await fetch('/api/ai/create-chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chartPrompt: params.chartPrompt,
      schema,
      problem: params.problem,
      objectives: params.objectives,
      tableName: params.tableName || 'dataset',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with ${res.status}`);
  }

  const result = await res.json();
  return result.data;
}
