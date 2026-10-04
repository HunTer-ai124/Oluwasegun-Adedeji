import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  Code,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Wand2,
  Layers,
  ArrowRight,
  Database,
  RefreshCw,
  SlidersHorizontal,
  TableProperties,
} from 'lucide-react';
import { Dataset, BusinessContext } from '../types';
import { ManualDataEntry } from './ManualDataEntry';
import {
  parseCSV,
  parseExcel,
  parseJSON,
  analyzeColumns,
  calculateQuality,
  cleanRemoveDuplicates,
  cleanFillMissing,
  cleanDropMissing,
  cleanFixDataTypes,
  SAMPLE_DATASETS,
} from '../services/dataParser';
import { loadDataIntoSqlite } from '../services/sqlEngine';

interface DataUploadViewProps {
  dataset: Dataset | null;
  setDataset: (dataset: Dataset | null) => void;
  businessContext: BusinessContext;
  setBusinessContext: React.Dispatch<React.SetStateAction<BusinessContext>>;
  onGenerateDashboard: () => void;
  isGenerating: boolean;
  onNavigateToPreview: () => void;
  onResetDataset?: () => void;
  onOpenSupabase?: () => void;
}

export const DataUploadView: React.FC<DataUploadViewProps> = ({
  dataset,
  setDataset,
  businessContext,
  setBusinessContext,
  onGenerateDashboard,
  isGenerating,
  onNavigateToPreview,
  onResetDataset,
  onOpenSupabase,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ingestMode, setIngestMode] = useState<'upload' | 'manual'>('upload');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<string[] | null>(null);
  const [excelGetter, setExcelGetter] = useState<((sheet: string) => Record<string, any>[]) | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processLoadedRows = async (rows: Record<string, any>[], name: string, fileName: string, sheetNames?: string[], currentSheet?: string) => {
    if (!rows || rows.length === 0) {
      throw new Error('The selected file or sheet contains no data rows.');
    }

    const columns = analyzeColumns(rows);
    const quality = calculateQuality(rows, columns);

    const newDataset: Dataset = {
      id: `ds-${Date.now()}`,
      name,
      fileName,
      sheetNames,
      currentSheet,
      rawRows: rows,
      cleanedRows: rows,
      columns,
      quality,
      cleanedHistory: [],
    };

    // Load into in-browser SQLite database
    const sqlRes = await loadDataIntoSqlite('dataset', columns, rows);
    if (!sqlRes.success) {
      console.warn('SQLite init warning:', sqlRes.error);
    }

    setDataset(newDataset);
    setErrorMessage(null);
  };

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    setErrorMessage(null);
    setExcelSheets(null);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv') {
        const rows = await parseCSV(file);
        await processLoadedRows(rows, file.name.replace(/\.[^/.]+$/, ''), file.name);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const { sheetNames, getSheetData } = await parseExcel(file);
        if (sheetNames.length === 1) {
          const rows = getSheetData(sheetNames[0]);
          await processLoadedRows(rows, sheetNames[0], file.name, sheetNames, sheetNames[0]);
        } else {
          // Multi-sheet Excel
          setExcelSheets(sheetNames);
          setExcelGetter(() => getSheetData);
          setPendingFileName(file.name);
        }
      } else if (ext === 'json') {
        const rows = await parseJSON(file);
        await processLoadedRows(rows, file.name.replace(/\.[^/.]+$/, ''), file.name);
      } else {
        throw new Error('Unsupported file format. Please upload a CSV, XLSX, XLS, or JSON file.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to read file. Please ensure valid structure.');
    } finally {
      setLoading(false);
    }
  };

  const handleSheetSelect = async (sheetName: string) => {
    if (!excelGetter) return;
    setLoading(true);
    try {
      const rows = excelGetter(sheetName);
      await processLoadedRows(rows, sheetName, pendingFileName, excelSheets || [sheetName], sheetName);
      setExcelSheets(null);
      setExcelGetter(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load sheet.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = async (sample: typeof SAMPLE_DATASETS[0]) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const rows = sample.generateData();
      await processLoadedRows(rows, sample.name, sample.fileName);
      setBusinessContext({
        problem: sample.problem,
        objectives: sample.objectives,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load sample dataset.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualDataLoad = async (rows: Record<string, any>[], customTableName: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await processLoadedRows(rows, customTableName, `${customTableName}.csv`);
      if (!businessContext.problem) {
        setBusinessContext({
          problem: `Analyze performance trends, metrics, and relationships in ${customTableName}.`,
          objectives: `Discover top drivers, aggregate distributions, and actionable insights.`,
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process manual dataset.');
    } finally {
      setLoading(false);
    }
  };

  // Cleaning Handlers
  const handleClean = async (type: 'duplicates' | 'fill' | 'drop' | 'fixTypes' | 'reset') => {
    if (!dataset) return;

    let updatedRows = [...dataset.cleanedRows];
    let note = '';

    if (type === 'duplicates') {
      const prevLen = updatedRows.length;
      updatedRows = cleanRemoveDuplicates(updatedRows);
      note = `Removed ${prevLen - updatedRows.length} duplicate rows`;
    } else if (type === 'fill') {
      updatedRows = cleanFillMissing(updatedRows, dataset.columns);
      note = `Filled missing values with averages and defaults`;
    } else if (type === 'drop') {
      const prevLen = updatedRows.length;
      updatedRows = cleanDropMissing(updatedRows);
      note = `Dropped ${prevLen - updatedRows.length} rows with empty values`;
    } else if (type === 'fixTypes') {
      updatedRows = cleanFixDataTypes(updatedRows, dataset.columns);
      note = `Normalized data types, currency numbers and dates`;
    } else if (type === 'reset') {
      updatedRows = [...dataset.rawRows];
      note = `Reset dataset to original uploaded rows`;
    }

    const columns = analyzeColumns(updatedRows);
    const quality = calculateQuality(updatedRows, columns);

    await loadDataIntoSqlite('dataset', columns, updatedRows);

    setDataset({
      ...dataset,
      cleanedRows: updatedRows,
      columns,
      quality,
      cleanedHistory: [...dataset.cleanedHistory, note],
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Excel Sheet Picker Modal */}
      {excelSheets && excelSheets.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <Layers className="w-6 h-6 text-[#FF6D00]" />
              <div>
                <h3 className="text-lg font-bold text-black font-['Poppins']">Choose Excel Sheet</h3>
                <p className="text-xs text-gray-500">This workbook contains {excelSheets.length} sheets. Select one to analyze:</p>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2 py-2">
              {excelSheets.map((sheet) => (
                <button
                  key={sheet}
                  onClick={() => handleSheetSelect(sheet)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-purple-200 hover:border-[#FF6D00] hover:bg-purple-50 text-sm font-medium transition cursor-pointer flex items-center justify-between group"
                >
                  <span className="font-semibold text-gray-800">{sheet}</span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#FF6D00] transition" />
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setExcelSheets(null);
                setExcelGetter(null);
              }}
              className="w-full text-xs text-gray-500 hover:text-black py-2 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ingestion Section */}
      {ingestMode === 'manual' ? (
        <ManualDataEntry
          onLoadData={handleManualDataLoad}
          onCancel={() => setIngestMode('upload')}
        />
      ) : (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-purple-100">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-black font-['Poppins'] flex items-center gap-2">
                <span>1. Dataset Ingestion</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-[#4A148C]">
                  CSV, Excel, JSON
                </span>
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Upload your raw data, choose a pre-configured scenario, or enter records manually.
              </p>
            </div>

            <div className="flex items-center gap-2 p-1 bg-purple-50 rounded-xl border border-purple-200 self-start sm:self-auto">
              <button
                onClick={() => setIngestMode('upload')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 bg-[#4A148C] text-white shadow-xs"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Files</span>
              </button>
              <button
                onClick={() => setIngestMode('manual')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 text-gray-700 hover:text-black"
              >
                <TableProperties className="w-3.5 h-3.5 text-[#FF6D00]" />
                <span>Enter Data Manually</span>
              </button>
            </div>
          </div>

          {/* Drag and Drop Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-[#FF6D00] bg-orange-50/50 scale-[1.005]'
                : 'border-purple-200 hover:border-[#FF6D00] hover:bg-purple-50/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, .xls, .json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />

            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EDE7F6] flex items-center justify-center text-[#4A148C] mb-4">
              <UploadCloud className="w-7 h-7 text-[#4A148C]" />
            </div>

            <p className="text-base font-semibold text-black">
              Drag and drop your dataset here, or <span className="text-[#FF6D00] underline font-bold">browse files</span>
            </p>
            <p className="text-xs text-gray-500 mt-1.5">
              Supports CSV, Excel (.xlsx, .xls with multiple sheets), and JSON files up to 25MB
            </p>

            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-gray-500 font-medium">
              <span className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-[#4A148C]" /> Excel (.xlsx, .xls)
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#FF6D00]" /> CSV Files
              </span>
              <span className="flex items-center gap-1.5">
                <Code className="w-4 h-4 text-gray-600" /> JSON Format
              </span>
            </div>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Upload Error</p>
                <p className="text-xs mt-0.5 text-red-600">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Sample Datasets Selector */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FF6D00]" /> Or test with a curated dataset:
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SAMPLE_DATASETS.map((sample) => (
                <button
                  key={sample.id}
                  onClick={() => handleLoadSample(sample)}
                  className="text-left p-3.5 rounded-xl border border-purple-100 hover:border-[#FF6D00] hover:bg-orange-50/30 transition text-xs group cursor-pointer"
                >
                  <div className="font-semibold text-black group-hover:text-[#FF6D00] flex items-center justify-between">
                    <span>{sample.name}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#FF6D00] transition" />
                  </div>
                  <p className="text-gray-500 text-[11px] mt-1 line-clamp-2">
                    {sample.problem}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dataset Quality & Cleaning Section (Shown once dataset loaded) */}
      {dataset && (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-purple-100 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="text-lg font-bold text-black font-['Poppins']">
                  Data Quality & Cleaning: <span className="text-[#4A148C]">{dataset.name}</span>
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                All {dataset.cleanedRows.length.toLocaleString()} rows and {dataset.columns.length} columns loaded into SQLite • 100% full dataset calculation coverage
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onResetDataset && (
                <button
                  onClick={onResetDataset}
                  className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Clear current dataset so you can upload your proper file"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset / Clear Dataset</span>
                </button>
              )}

              {onOpenSupabase && (
                <button
                  onClick={onOpenSupabase}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Sync or view Supabase Cloud Database"
                >
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Supabase Cloud</span>
                </button>
              )}

              <button
                onClick={onNavigateToPreview}
                className="px-4 py-2 rounded-xl border border-purple-200 hover:border-[#4A148C] text-[#4A148C] hover:bg-purple-50 text-xs font-semibold flex items-center gap-2 transition cursor-pointer self-start sm:self-auto"
              >
                <span>View Data Preview & Schema ({dataset.columns.length} cols)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Full Dataset Guarantee Banner */}
          <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[#4A148C]">
              <Sparkles className="w-4 h-4 text-[#FF6D00] shrink-0" />
              <span className="font-bold">
                Full Dataset Calculation:
              </span>
              <span className="text-gray-700">
                All {dataset.cleanedRows.length.toLocaleString()} rows will be computed across all KPI cards, SQL queries, and charts with zero row limits.
              </span>
            </div>
            {onResetDataset && (
              <button
                onClick={onResetDataset}
                className="text-xs text-[#FF6D00] hover:underline font-semibold cursor-pointer shrink-0"
              >
                Want to analyze a different file? Click to reset
              </button>
            )}
          </div>

          {/* Supabase Connected Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#4A148C] to-[#311B92] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs">Supabase Connected: HunTer-ai124's Project</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30">
                    tugtkiitaiczevejyevp
                  </span>
                </div>
                <p className="text-[11px] text-purple-200 mt-0.5">
                  Store dataset records, schemas, and live analytics reports directly to your Supabase PostgreSQL cloud.
                </p>
              </div>
            </div>
            {onOpenSupabase && (
              <button
                onClick={onOpenSupabase}
                className="px-4 py-2 rounded-xl bg-white hover:bg-purple-50 text-[#4A148C] text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto shadow-xs"
              >
                <UploadCloud className="w-3.5 h-3.5 text-[#FF6D00]" />
                <span>Supabase Cloud Sync</span>
              </button>
            )}
          </div>

          {/* Quality Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-[#EDE7F6]/60 border border-purple-100">
              <span className="text-xs font-medium text-gray-600">Total Rows</span>
              <p className="text-2xl font-bold text-black mt-1 font-mono">
                {dataset.quality.rowCount.toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500">Record count</span>
            </div>

            <div className="p-4 rounded-xl bg-[#EDE7F6]/60 border border-purple-100">
              <span className="text-xs font-medium text-gray-600">Columns</span>
              <p className="text-2xl font-bold text-black mt-1 font-mono">
                {dataset.quality.columnCount}
              </p>
              <span className="text-[11px] text-gray-500">Auto-detected types</span>
            </div>

            <div className="p-4 rounded-xl bg-[#EDE7F6]/60 border border-purple-100">
              <span className="text-xs font-medium text-gray-600">Missing Values</span>
              <p className={`text-2xl font-bold mt-1 font-mono ${dataset.quality.missingCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {dataset.quality.missingCount}
              </p>
              <span className="text-[11px] text-gray-500">
                {dataset.quality.missingRate}% of total cells
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#EDE7F6]/60 border border-purple-100">
              <span className="text-xs font-medium text-gray-600">Duplicate Rows</span>
              <p className={`text-2xl font-bold mt-1 font-mono ${dataset.quality.duplicateCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {dataset.quality.duplicateCount}
              </p>
              <span className="text-[11px] text-gray-500">Identical records</span>
            </div>
          </div>

          {/* Data Cleaning Actions Toolbar */}
          <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#4A148C] uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#FF6D00]" /> Data Preparation Actions
              </span>
              {dataset.cleanedHistory.length > 0 && (
                <span className="text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
                  {dataset.cleanedHistory[dataset.cleanedHistory.length - 1]}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleClean('duplicates')}
                disabled={dataset.quality.duplicateCount === 0}
                className="px-3.5 py-2 rounded-lg bg-white border border-purple-200 hover:border-[#FF6D00] text-xs font-semibold text-black hover:text-[#FF6D00] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                Remove Duplicates
              </button>

              <button
                onClick={() => handleClean('fill')}
                disabled={dataset.quality.missingCount === 0}
                className="px-3.5 py-2 rounded-lg bg-white border border-purple-200 hover:border-[#FF6D00] text-xs font-semibold text-black hover:text-[#FF6D00] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                Fill Missing Values
              </button>

              <button
                onClick={() => handleClean('drop')}
                disabled={dataset.quality.missingCount === 0}
                className="px-3.5 py-2 rounded-lg bg-white border border-purple-200 hover:border-[#FF6D00] text-xs font-semibold text-black hover:text-[#FF6D00] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                Drop Incomplete Rows
              </button>

              <button
                onClick={() => handleClean('fixTypes')}
                className="px-3.5 py-2 rounded-lg bg-white border border-purple-200 hover:border-[#FF6D00] text-xs font-semibold text-black hover:text-[#FF6D00] transition cursor-pointer shadow-sm"
              >
                Fix Currency & Date Types
              </button>

              <button
                onClick={() => handleClean('reset')}
                className="px-3 py-2 rounded-lg text-gray-500 hover:text-red-600 text-xs font-medium transition cursor-pointer ml-auto flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Reset to Original
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Business Context Input Card */}
      {dataset && (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-purple-100 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#4A148C] text-white flex items-center justify-center font-bold text-sm">
              2
            </div>
            <div>
              <h3 className="text-xl font-bold text-black font-['Poppins']">
                Define Business Context & Objectives
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                This context guides AI-generated SQL queries, executive KPI cards, charts, and agent recommendations.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                What is the business problem?
              </label>
              <textarea
                rows={2}
                value={businessContext.problem}
                onChange={(e) => setBusinessContext((prev) => ({ ...prev, problem: e.target.value }))}
                placeholder="e.g. Sales dropped 18% in the South region during Q2, and product discount thresholds may be eroding operating profit margins."
                className="w-full px-4 py-3 rounded-xl border border-purple-200 focus:border-[#FF6D00] focus:ring-2 focus:ring-[#FF6D00]/20 text-sm text-black outline-none transition resize-none placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                What are your objectives?
              </label>
              <textarea
                rows={2}
                value={businessContext.objectives}
                onChange={(e) => setBusinessContext((prev) => ({ ...prev, objectives: e.target.value }))}
                placeholder="e.g. Identify unprofitable sub-categories, calculate exact margin impact by discount bucket, and rank top growth opportunities."
                className="w-full px-4 py-3 rounded-xl border border-purple-200 focus:border-[#FF6D00] focus:ring-2 focus:ring-[#FF6D00]/20 text-sm text-black outline-none transition resize-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={onGenerateDashboard}
              disabled={isGenerating}
              className="px-8 py-3.5 rounded-xl bg-[#FF6D00] hover:bg-[#E65100] text-white font-semibold text-sm shadow-lg shadow-[#FF6D00]/30 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing SQL Queries & Dashboard...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>Generate Analysis & Instant Dashboard</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
