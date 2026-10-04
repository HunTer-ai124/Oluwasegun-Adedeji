import React from 'react';
import {
  UploadCloud,
  TableProperties,
  Terminal,
  LayoutDashboard,
  Database,
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
  Trash2,
} from 'lucide-react';
import { Dataset } from '../types';

interface SidebarProps {
  activeTab: 'upload' | 'preview' | 'sql' | 'dashboard';
  setActiveTab: (tab: 'upload' | 'preview' | 'sql' | 'dashboard') => void;
  dataset: Dataset | null;
  onNewUpload: () => void;
  hasGeneratedDashboard: boolean;
  onOpenSupabase?: () => void;
  onResetDataset?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  dataset,
  onNewUpload,
  hasGeneratedDashboard,
  onOpenSupabase,
  onResetDataset,
}) => {
  const navItems = [
    {
      id: 'upload' as const,
      label: 'Upload & Clean',
      icon: UploadCloud,
      badge: dataset ? `${dataset.cleanedRows.length} rows` : undefined,
    },
    {
      id: 'preview' as const,
      label: 'Data Preview',
      icon: TableProperties,
      disabled: !dataset,
      badge: dataset ? `${dataset.columns.length} cols` : undefined,
    },
    {
      id: 'sql' as const,
      label: 'SQL Studio',
      icon: Terminal,
      disabled: !dataset,
    },
    {
      id: 'dashboard' as const,
      label: 'Instant Dashboard',
      icon: LayoutDashboard,
      disabled: !dataset,
      highlight: hasGeneratedDashboard,
    },
  ];

  return (
    <aside className="w-64 bg-[#4A148C] text-white flex flex-col h-screen shrink-0 border-r border-[#380e6d] select-none shadow-xl z-20">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#5c1c9c] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FF6D00] flex items-center justify-center shadow-md shadow-[#FF6D00]/30 font-bold text-white text-xl">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5 font-['Poppins']">
              InsightLab
            </h1>
            <p className="text-[11px] text-purple-200 font-medium">
              AI Analytics & SQL Engine
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-5 px-3 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-purple-300">
          Analytics Workflow
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isDisabled = item.disabled;

          return (
            <button
              key={item.id}
              disabled={isDisabled}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-[#FF6D00] text-white shadow-md shadow-[#FF6D00]/30 font-semibold'
                  : isDisabled
                  ? 'opacity-40 cursor-not-allowed text-purple-300'
                  : 'text-purple-100 hover:bg-[#5c1c9c] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-purple-200'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                    isActive ? 'bg-black/30 text-white' : 'bg-[#5c1c9c] text-purple-200'
                  }`}
                >
                  {item.badge}
                </span>
              )}
              {item.highlight && !isActive && (
                <span className="w-2 h-2 rounded-full bg-[#FF6D00] animate-pulse"></span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Dataset Footer */}
      <div className="p-4 border-t border-[#5c1c9c] bg-[#3a0d70]">
        {dataset ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-purple-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#FF6D00]" />
                Active Table
              </span>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                SQLite Ready
              </span>
            </div>
            <div className="bg-[#4A148C]/80 p-2.5 rounded-lg border border-[#5c1c9c]">
              <div className="flex items-center gap-2 truncate">
                <FileSpreadsheet className="w-4 h-4 text-[#FF6D00] shrink-0" />
                <span className="text-xs font-semibold text-white truncate" title={dataset.name}>
                  {dataset.name}
                </span>
              </div>
              <div className="text-[11px] text-purple-200 mt-1 flex justify-between font-mono">
                <span>{dataset.cleanedRows.length} rows</span>
                <span>{dataset.columns.length} columns</span>
              </div>
            </div>
            <div className="flex gap-1.5 pt-1">
              <button
                onClick={onNewUpload}
                className="flex-1 text-center text-xs text-purple-200 hover:text-white py-1.5 rounded hover:bg-[#5c1c9c] transition-colors cursor-pointer"
              >
                + New Upload
              </button>
              {onResetDataset && (
                <button
                  onClick={onResetDataset}
                  className="px-2.5 py-1.5 text-xs text-red-300 hover:text-white hover:bg-red-900/50 rounded transition-colors cursor-pointer flex items-center gap-1"
                  title="Reset and clear dataset"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs text-purple-300">No dataset loaded</p>
            <p className="text-[11px] text-purple-400 mt-0.5">Upload a CSV, Excel or JSON to start</p>
          </div>
        )}

        {/* Supabase Cloud Connection Status */}
        {onOpenSupabase && (
          <button
            onClick={onOpenSupabase}
            className="w-full mt-3 p-2 rounded-lg bg-[#27094e] hover:bg-[#320c64] border border-[#5c1c9c]/60 flex items-center justify-between text-left transition cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
              <div className="truncate">
                <span className="text-[11px] font-bold text-white block truncate group-hover:text-emerald-300 transition">
                  HunTer-ai124's Project
                </span>
                <span className="text-[9px] text-purple-300 font-mono">Supabase Connected</span>
              </div>
            </div>
            <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          </button>
        )}
      </div>
    </aside>
  );
};
