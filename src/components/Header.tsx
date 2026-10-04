import React from 'react';
import { Bot, PanelRightClose, PanelRightOpen, FileDown, Sparkles, Database, RotateCcw, Trash2 } from 'lucide-react';
import { Dataset } from '../types';

interface HeaderProps {
  activeTab: 'upload' | 'preview' | 'sql' | 'dashboard';
  dataset: Dataset | null;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  onExportDashboard?: () => void;
  onOpenSupabase?: () => void;
  onResetDataset?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  dataset,
  isChatOpen,
  setIsChatOpen,
  onExportDashboard,
  onOpenSupabase,
  onResetDataset,
}) => {
  const getTabTitle = () => {
    switch (activeTab) {
      case 'upload':
        return 'Data Upload & Quality Preparation';
      case 'preview':
        return 'Data Preview & Schema Inspector';
      case 'sql':
        return 'In-Browser SQL Query Studio';
      case 'dashboard':
        return 'Instant Executive Dashboard';
    }
  };

  return (
    <header className="h-16 bg-[#4A148C] text-white border-b border-[#5c1c9c] px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-white tracking-tight font-['Poppins']">
          {getTabTitle()}
        </h2>
        {dataset && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#3a0d70] border border-[#5c1c9c] text-xs text-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Table: <strong className="text-white font-mono">dataset</strong> ({dataset.cleanedRows.length.toLocaleString()} rows)
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Supabase Cloud Connection Button */}
        {onOpenSupabase && (
          <button
            onClick={onOpenSupabase}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 text-xs font-semibold transition cursor-pointer"
            title="Open Supabase Cloud Database Manager (HunTer-ai124's Project)"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Supabase Cloud</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>
        )}

        {/* Reset Dataset Button */}
        {dataset && onResetDataset && (
          <button
            onClick={onResetDataset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#3a0d70] hover:bg-red-900/60 text-purple-200 hover:text-white border border-[#5c1c9c] hover:border-red-500 text-xs font-medium transition cursor-pointer"
            title="Clear dataset and reset to upload your proper file"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Reset Dataset</span>
          </button>
        )}

        {activeTab === 'dashboard' && onExportDashboard && (
          <button
            onClick={onExportDashboard}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#5c1c9c] hover:bg-[#6c23b5] text-white text-xs font-medium transition cursor-pointer"
            title="Export Dashboard"
          >
            <FileDown className="w-3.5 h-3.5 text-[#FF6D00]" />
            <span>Export PDF</span>
          </button>
        )}

        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer shadow-sm ${
            isChatOpen
              ? 'bg-[#FF6D00] text-white shadow-[#FF6D00]/30'
              : 'bg-[#5c1c9c] hover:bg-[#6c23b5] text-purple-100'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>AI Data Agent</span>
          {isChatOpen ? (
            <PanelRightClose className="w-3.5 h-3.5 opacity-80" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5 opacity-80" />
          )}
        </button>
      </div>
    </header>
  );
};
