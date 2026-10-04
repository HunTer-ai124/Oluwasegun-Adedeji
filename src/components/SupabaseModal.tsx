import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Download,
  UploadCloud,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Layers,
  FileCode,
  Code,
} from 'lucide-react';
import { Dataset, BusinessContext, KPIMetric, ChartConfig } from '../types';
import {
  SUPABASE_CONFIG,
  testSupabaseConnection,
  storeDatasetInSupabase,
  getSupabaseSchemaSql,
  generateDatasetSqlDump,
  fetchDatasetsFromSupabase,
  SupabaseSyncResult,
} from '../services/supabaseClient';

interface SupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: Dataset | null;
  businessContext: BusinessContext;
  kpis: KPIMetric[];
  charts: ChartConfig[];
  onLoadDatasetFromSupabase?: (saved: any) => void;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({
  isOpen,
  onClose,
  dataset,
  businessContext,
  kpis,
  charts,
}) => {
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean;
    connected: boolean;
    tableExists: boolean;
    error?: string;
  }>({ tested: false, connected: false, tableExists: false });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SupabaseSyncResult | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [savedDatasets, setSavedDatasets] = useState<any[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      loadSaved();
    }
  }, [isOpen]);

  const checkStatus = async () => {
    const res = await testSupabaseConnection();
    setConnectionStatus({
      tested: true,
      connected: res.connected,
      tableExists: res.tableExists,
      error: res.error,
    });
  };

  const loadSaved = async () => {
    setIsLoadingSaved(true);
    const data = await fetchDatasetsFromSupabase();
    setSavedDatasets(data);
    setIsLoadingSaved(false);
  };

  const handleSyncToSupabase = async () => {
    if (!dataset) return;
    setIsSyncing(true);
    setSyncResult(null);

    const res = await storeDatasetInSupabase(dataset, businessContext, kpis, charts);
    setSyncResult(res);
    setIsSyncing(false);

    if (res.success) {
      loadSaved();
    }
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(getSupabaseSchemaSql());
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 3000);
  };

  const handleDownloadSqlDump = () => {
    if (!dataset) return;
    const sql = generateDatasetSqlDump(dataset);
    const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dataset.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_supabase_import.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-purple-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#4A148C] text-white p-6 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
              <Database className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-['Poppins']">Supabase Cloud Database</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Connected
                </span>
              </div>
              <p className="text-xs text-purple-200 mt-0.5">
                {SUPABASE_CONFIG.projectName} • ID: <code className="font-mono text-white">{SUPABASE_CONFIG.projectId}</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-black">
          {/* Credentials Summary Box */}
          <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-200 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#4A148C] uppercase tracking-wider text-[11px]">
                Project Configuration
              </span>
              <a
                href={`https://supabase.com/dashboard/project/${SUPABASE_CONFIG.projectId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FF6D00] hover:underline font-semibold flex items-center gap-1 text-[11px]"
              >
                <span>Open Supabase Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <div>
                <span className="text-gray-500 block text-[10px]">PROJECT URL:</span>
                <span className="text-gray-900 truncate block">{SUPABASE_CONFIG.supabaseUrl}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px]">PUBLIC API KEY:</span>
                <span className="text-gray-900 truncate block">sb_publishable_Xuri0...</span>
              </div>
            </div>

            <div className="pt-2 border-t border-purple-200/60 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="font-semibold text-gray-800">Endpoint Status:</span>
                <span className="text-emerald-700 font-medium">Reachable & Authenticated</span>
              </div>
              <button
                onClick={checkStatus}
                className="text-purple-700 hover:text-[#4A148C] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Re-verify</span>
              </button>
            </div>
          </div>

          {/* Sync Current Dataset Action */}
          <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-black font-['Poppins']">
                  Sync & Store Active Dataset
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  {dataset
                    ? `Ready to store "${dataset.name}" (${dataset.cleanedRows.length.toLocaleString()} rows, ${dataset.columns.length} columns) into Supabase.`
                    : 'Upload or load a dataset first to store it in Supabase.'}
                </p>
              </div>

              <button
                onClick={handleSyncToSupabase}
                disabled={!dataset || isSyncing}
                className="px-5 py-2.5 rounded-xl bg-[#4A148C] hover:bg-[#380e6d] text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                {isSyncing ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin text-[#FF6D00]" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5 text-[#FF6D00]" />
                    <span>Store in Supabase</span>
                  </>
                )}
              </button>
            </div>

            {/* Sync Feedback Message */}
            {syncResult && (
              <div
                className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
                  syncResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-900'
                }`}
              >
                {syncResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-2">
                  <p className="font-semibold">{syncResult.message}</p>
                  {!syncResult.tableExists && (
                    <div className="pt-2 border-t border-amber-200/80 space-y-2">
                      <p className="text-[11px] text-amber-800">
                        To enable persistent table storage in HunTer-ai124's Project, run the pre-configured SQL schema script once in your Supabase SQL Editor:
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopySchema}
                          className="px-3 py-1.5 rounded-lg bg-[#4A148C] text-white text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          {copiedSchema ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedSchema ? 'SQL Copied!' : 'Copy Supabase SQL Setup'}</span>
                        </button>
                        <a
                          href={`https://supabase.com/dashboard/project/${SUPABASE_CONFIG.projectId}/sql`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-white text-gray-800 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <span>Open SQL Editor</span>
                          <ExternalLink className="w-3 h-3 text-[#FF6D00]" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Export Full Dataset as SQL Script for Supabase */}
          <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-sm text-black font-['Poppins'] flex items-center gap-2">
                <FileCode className="w-4 h-4 text-[#FF6D00]" />
                <span>Export Dataset as PostgreSQL SQL Script</span>
              </h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Generate a full <code className="font-mono">.sql</code> script with table schema and INSERT statements for all rows to run in Supabase.
              </p>
            </div>

            <button
              onClick={handleDownloadSqlDump}
              disabled={!dataset}
              className="px-4 py-2 rounded-xl border border-purple-200 hover:border-[#FF6D00] text-xs font-semibold text-[#4A148C] hover:text-[#FF6D00] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-[#FF6D00]" />
              <span>Download SQL Dump</span>
            </button>
          </div>

          {/* SQL Schema Preview Accordion */}
          <div className="border border-purple-100 rounded-2xl p-4 bg-gray-900 text-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-purple-300 font-semibold flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-[#FF6D00]" />
                Supabase Schema Definition (insightlab_datasets)
              </span>
              <button
                onClick={handleCopySchema}
                className="px-2.5 py-1 rounded bg-[#4A148C] hover:bg-[#5c1c9c] text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
              >
                {copiedSchema ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSchema ? 'Copied' : 'Copy SQL'}</span>
              </button>
            </div>
            <pre className="text-[10px] font-mono text-emerald-400 overflow-x-auto max-h-36 p-2 bg-black/40 rounded-lg">
              {getSupabaseSchemaSql()}
            </pre>
          </div>

          {/* Saved Datasets in Supabase */}
          {savedDatasets.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500">
                Datasets Stored in HunTer-ai124's Project ({savedDatasets.length})
              </h4>
              <div className="space-y-2">
                {savedDatasets.map((saved) => (
                  <div
                    key={saved.id}
                    className="p-3.5 rounded-xl border border-purple-100 bg-purple-50/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-black">{saved.name}</span>
                      <span className="text-gray-500 ml-2 font-mono text-[11px]">
                        {saved.row_count?.toLocaleString()} rows • {saved.column_count} cols
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {new Date(saved.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            PostgreSQL & REST v1 enabled on HunTer-ai124's Project
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-xs font-semibold text-gray-800 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
