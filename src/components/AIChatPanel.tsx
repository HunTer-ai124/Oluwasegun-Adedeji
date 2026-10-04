import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Code2,
  ChevronDown,
  ChevronUp,
  Table as TableIcon,
  BarChart3,
  RotateCcw,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ChatMessage, Dataset, BusinessContext } from '../types';
import { executeQuery } from '../services/sqlEngine';
import { chatAgentGenerateSql, chatAgentSynthesize } from '../services/aiService';

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: Dataset | null;
  businessContext: BusinessContext;
  starterQuestions: string[];
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  isOpen,
  onClose,
  dataset,
  businessContext,
  starterQuestions,
  messages,
  setMessages,
}) => {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [expandedSqlIds, setExpandedSqlIds] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isProcessing]);

  const toggleSqlExpand = (id: string) => {
    setExpandedSqlIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !dataset || isProcessing) return;

    setInputText('');
    const userMsgId = `user-${Date.now()}`;
    const agentMsgId = `agent-${Date.now()}`;

    // Add user message
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);
    setProcessingStatus('Analyzing question & generating SQL...');

    try {
      // Step 1: Agent decides SQL query based on schema
      const history = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const plan = await chatAgentGenerateSql({
        message: text,
        history,
        columns: dataset.columns,
        problem: businessContext.problem,
        objectives: businessContext.objectives,
        tableName: 'dataset',
      });

      let queryResults: Record<string, any>[] | undefined = undefined;
      let executedSql = plan.sql;

      if (plan.needsSql && plan.sql) {
        setProcessingStatus('Running SQLite query on your dataset...');
        try {
          const res = await executeQuery(plan.sql);
          queryResults = res.rawObjects;
        } catch (sqlErr: any) {
          console.warn('Chat SQL Execution Failed, attempting fallback:', sqlErr);
          // Try a simplified query if needed
          executedSql = `/* Error: ${sqlErr.message} */\n${plan.sql}`;
        }
      }

      // Step 2: Agent synthesizes answer from results (never sends raw data, only results)
      setProcessingStatus('Synthesizing plain-English answer...');
      const synthesis = await chatAgentSynthesize({
        message: text,
        sql: executedSql,
        queryResults: queryResults ? queryResults.slice(0, 15) : undefined,
        problem: businessContext.problem,
        objectives: businessContext.objectives,
      });

      const agentMsg: ChatMessage = {
        id: agentMsgId,
        role: 'agent',
        content: synthesis.answer || plan.explanation || 'Here is the analysis based on your data.',
        keyTakeaway: synthesis.keyTakeaway,
        sql: executedSql,
        queryResults: queryResults && queryResults.length > 0 ? queryResults : undefined,
        displayType: (plan.displayType as any) || (queryResults && queryResults.length > 3 ? 'table' : 'text'),
        chartType: (plan.chartType as any) || 'bar',
        xKey: plan.xKey,
        yKeys: plan.yKeys,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      console.error('Agent chat error:', err);
      const errorMsg: ChatMessage = {
        id: agentMsgId,
        role: 'agent',
        content: `I encountered an issue answering that question: ${err.message || 'Please check query syntax and try again.'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="w-80 sm:w-96 bg-white border-l border-purple-200 flex flex-col h-screen shrink-0 shadow-2xl z-30 select-none">
      {/* Header */}
      <div className="p-4 bg-[#4A148C] text-white flex items-center justify-between border-b border-[#5c1c9c]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#FF6D00] flex items-center justify-center font-bold text-white shadow-sm">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white font-['Poppins']">
              AI Data Agent
            </h3>
            <p className="text-[10px] text-purple-200">
              Runs SQL behind the scenes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-1 rounded text-purple-200 hover:text-white hover:bg-[#5c1c9c] text-xs cursor-pointer"
              title="Clear chat session"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-purple-200 hover:text-white hover:bg-[#5c1c9c] cursor-pointer"
            title="Collapse chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Suggested Starter Questions (if no or few messages) */}
      {messages.length <= 1 && starterQuestions.length > 0 && (
        <div className="p-3 bg-purple-50/70 border-b border-purple-100">
          <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#FF6D00]" /> Suggested Questions
          </span>
          <div className="space-y-1.5">
            {starterQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(q)}
                disabled={isProcessing || !dataset}
                className="w-full text-left p-2 rounded-lg bg-white hover:bg-orange-50/50 border border-purple-100 hover:border-[#FF6D00] text-xs text-gray-800 transition cursor-pointer line-clamp-2 shadow-xs group"
              >
                <span className="group-hover:text-[#FF6D00] font-medium">{q}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#EDE7F6]/30">
        {messages.length === 0 && (
          <div className="text-center py-12 px-4">
            <Bot className="w-10 h-10 text-purple-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-gray-700">Ask any question about your data</p>
            <p className="text-[11px] text-gray-500 mt-1">
              The agent will automatically write SQLite queries, execute them on your browser, and explain the findings in plain English.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isExpanded = !!expandedSqlIds[msg.id];

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5`}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 px-1">
                {isUser ? (
                  <>
                    <span>You</span>
                    <User className="w-3 h-3 text-[#FF6D00]" />
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-[#4A148C]" />
                    <span className="font-semibold text-[#4A148C]">InsightLab Agent</span>
                  </>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`p-3.5 rounded-2xl text-xs max-w-[95%] leading-relaxed ${
                  isUser
                    ? 'bg-[#FF6D00] text-white rounded-br-none shadow-sm'
                    : 'bg-white text-black border border-purple-100 rounded-bl-none shadow-sm space-y-2.5'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Key Takeaway Highlight */}
                {msg.keyTakeaway && (
                  <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-100 flex items-start gap-1.5 text-purple-950 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF6D00] shrink-0 mt-0.5" />
                    <span>{msg.keyTakeaway}</span>
                  </div>
                )}

                {/* Mini Chart Visualization */}
                {msg.displayType === 'chart' && msg.queryResults && msg.queryResults.length > 0 && msg.xKey && (
                  <div className="pt-2 border-t border-gray-100">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                      Visual Distribution:
                    </span>
                    <div className="h-44 w-full bg-purple-50/40 rounded-xl p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={msg.queryResults.slice(0, 8)} margin={{ top: 5, right: 5, left: -20, bottom: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9D5FF" />
                          <XAxis dataKey={msg.xKey} tick={{ fontSize: 9, fill: '#6B7280' }} interval={0} angle={-20} textAnchor="end" />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} />
                          <Tooltip contentStyle={{ backgroundColor: '#4A148C', borderRadius: '8px', color: '#fff', fontSize: '10px' }} />
                          <Bar dataKey={msg.yKeys?.[0] || Object.keys(msg.queryResults[0])[1]} fill="#FF6D00" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Mini Table Visualization */}
                {msg.displayType === 'table' && msg.queryResults && msg.queryResults.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        Result Table ({msg.queryResults.length} rows)
                      </span>
                    </div>
                    <div className="max-h-40 overflow-auto rounded-lg border border-purple-100">
                      <table className="w-full text-[10px] text-left border-collapse">
                        <thead className="bg-[#4A148C] text-white sticky top-0">
                          <tr>
                            {Object.keys(msg.queryResults[0]).map((col) => (
                              <th key={col} className="p-1.5 whitespace-nowrap font-semibold">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {msg.queryResults.slice(0, 10).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-purple-50/50">
                              {Object.values(row).map((val: any, cIdx) => (
                                <td key={cIdx} className="p-1.5 whitespace-nowrap font-mono text-gray-700">
                                  {val === null || val === undefined ? '—' : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Collapsible Behind-The-Scenes SQL View */}
                {msg.sql && (
                  <div className="pt-1.5 border-t border-gray-100">
                    <button
                      onClick={() => toggleSqlExpand(msg.id)}
                      className="flex items-center justify-between w-full text-[10px] font-semibold text-gray-500 hover:text-[#4A148C] transition cursor-pointer py-0.5"
                    >
                      <span className="flex items-center gap-1">
                        <Code2 className="w-3 h-3 text-[#FF6D00]" />
                        <span>SQL Query Executed Behind The Scenes</span>
                      </span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-1.5 p-2.5 rounded-lg bg-gray-900 text-emerald-400 font-mono text-[10px] overflow-x-auto leading-relaxed">
                        <pre className="whitespace-pre-wrap">{msg.sql}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="flex items-center gap-2 text-xs text-[#4A148C] bg-white p-3 rounded-2xl border border-purple-100 shadow-xs">
            <RotateCcw className="w-3.5 h-3.5 animate-spin text-[#FF6D00]" />
            <span className="font-medium animate-pulse">{processingStatus}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 bg-white border-t border-purple-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isProcessing || !dataset}
            placeholder={dataset ? 'Ask questions about your data...' : 'Upload dataset to chat...'}
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-purple-200 text-xs text-black placeholder:text-gray-400 focus:border-[#FF6D00] focus:ring-1 focus:ring-[#FF6D00] outline-none transition disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={isProcessing || !inputText.trim() || !dataset}
            className="w-9 h-9 rounded-xl bg-[#FF6D00] hover:bg-[#E65100] text-white flex items-center justify-center transition disabled:opacity-40 cursor-pointer shadow-sm shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </aside>
  );
};
