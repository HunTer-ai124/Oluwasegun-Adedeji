export type ColumnType = 'text' | 'number' | 'date' | 'currency' | 'boolean';

export interface ColumnMetadata {
  name: string;
  type: ColumnType;
  sampleValues: any[];
  nullCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
}

export interface DataQualitySummary {
  rowCount: number;
  columnCount: number;
  missingCount: number;
  missingRate: number; // percentage
  duplicateCount: number;
}

export interface Dataset {
  id: string;
  name: string;
  fileName: string;
  sheetNames?: string[];
  currentSheet?: string;
  rawRows: Record<string, any>[];
  cleanedRows: Record<string, any>[];
  columns: ColumnMetadata[];
  quality: DataQualitySummary;
  cleanedHistory: string[];
}

export interface BusinessContext {
  problem: string;
  objectives: string;
}

export interface KPIMetric {
  id?: string;
  title: string;
  sql: string;
  format: 'currency' | 'number' | 'percent';
  insight: string;
  calculatedValue?: number | string;
  error?: string;
}

export interface ChartConfig {
  id: string;
  title: string;
  chartType: 'bar' | 'line' | 'pie' | 'donut' | 'area' | 'scatter';
  sql: string;
  xKey: string;
  yKeys: string[];
  caption: string;
  data?: Record<string, any>[];
  error?: string;
}

export interface SavedQuery {
  id: string;
  title: string;
  explanation: string;
  sql: string;
  results?: {
    columns: string[];
    values: any[][];
    rowCount: number;
    executionTimeMs: number;
  };
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  sql?: string;
  queryResults?: Record<string, any>[];
  displayType?: 'text' | 'table' | 'chart';
  chartType?: 'bar' | 'line' | 'pie';
  xKey?: string;
  yKeys?: string[];
  keyTakeaway?: string;
  timestamp: number;
  isExecuting?: boolean;
}
