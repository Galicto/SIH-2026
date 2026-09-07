import React, { useState, useRef } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { useWealthData } from '../hooks/useWealthData';
import DonutChart from '../components/DonutChart';
import { useAnalysis } from '../context/AnalysisContext';
import { API_BASE_URL } from '../config';
import { useReveal, revealClass } from '../hooks/useReveal';

const ALGO_TO_INR = 10_000;

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function Analysis() {
  const {
    activeAddress, algoBalance, inrBalance, balanceLoading,
    activePositions, wonPositions, lostPositions,
    totalWageredINR, totalPotentialINR, totalWonINR,
    myTrades, myPositions, netWorthINR,
  } = useWealthData();

  // Text-to-Speech state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [processingSource, setProcessingSource] = useState<'upload' | 'app' | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handleSpeak = () => {
    if (!aiSummary) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const cleanText = aiSummary.replace(/[*#_•]/g, '').replace(/\n+/g, '. ');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechRef.current = utterance;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // All state comes from global context — persists across navigation
  const {
    aiChartData, setAiChartData,
    rawTransactions, setRawTransactions,
    aiSummary, setAiSummary,
    isThinking, setIsThinking,
    isProcessing, setIsProcessing,
    isDownloading, setIsDownloading,
    errorMsg, setErrorMsg,
    history, addHistoryRecord,
  } = useAnalysis();

  const chartColors = ['#3B82F6', '#8B5CF6', '#06B6D4', '#22C55E', '#F59E0B', '#EC4899', '#EF4444', '#14B8A6', '#6366F1', '#F97316'];

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProcessingSource('upload');
    setErrorMsg('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/upload-expenses`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('API server returned error');
      const data = await res.json();

      setRawTransactions(data.data);

      const categoryTotals: Record<string, number> = {};
      data.data.forEach((item: any) => {
        const cat = item.ai_category;
        let amt = parseFloat(item.amount);
        if (isNaN(amt) || amt <= 0) amt = 10;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      });

      const segments = Object.entries(categoryTotals).map(([label, value], idx) => ({
        label,
        value,
        color: chartColors[idx % chartColors.length]
      }));

      const sortedSegments = segments.sort((a, b) => b.value - a.value);
      setAiChartData(sortedSegments);

      // Fetch LLM Summary
      setIsThinking(true);
      try {
        const sumRes = await fetch(`${API_BASE_URL}/api/generate-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category_totals: categoryTotals })
        });
        const sumData = await sumRes.json();
        setAiSummary(sumData.summary);

        const totalSpend = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
        addHistoryRecord({
          id: Date.now(),
          filename: file.name,
          summary: sumData.summary,
          chartData: sortedSegments,
          totalSpend,
          topCategory: sortedSegments[0]?.label || 'N/A',
        });

      } catch (e) {
        setAiSummary("LLM connection unreachable.");
      } finally {
        setIsThinking(false);
      }

    } catch (err: any) {
      setErrorMsg('Failed to process file with AI Backend. Is it running?');
    } finally {
      setIsProcessing(false);
      setProcessingSource(null);
      if (event.target) event.target.value = '';
    }
  };

  const handleAppTransactions = async () => {
    setIsProcessing(true);
    setProcessingSource('app');
    setErrorMsg('');
    
    // Construct strict CSV format: date,description,amount,type,category,necessity
    const rows: string[] = [];
    myTrades.forEach((t) => {
      const date = t.timestamp ? new Date(t.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const desc = `${t.side.toUpperCase()} ${t.symbol.replace(/,/g, '')} - ${t.assetType}`;
      const amount = (t.algoAmount * ALGO_TO_INR).toFixed(2);
      const type = t.side === 'buy' ? 'debit' : 'credit';
      rows.push(`${date},${desc},${amount},${type},Crypto Trading,Optional`);
    });
    
    myPositions.forEach((p) => {
      const date = p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const desc = `Prediction Position: ${p.outcome}`;
      const amount = (p.amount * ALGO_TO_INR).toFixed(2);
      rows.push(`${date},${desc},${amount},debit,Prediction Market,Optional`);
    });

    if (rows.length === 0) {
      setErrorMsg('No app transactions to analyze.');
      setIsProcessing(false);
      setProcessingSource(null);
      return;
    }

    const csvData = "date,description,amount,type,category,necessity\n" + rows.join("\n");

    try {
      const res = await fetch(`${API_BASE_URL}/api/save-app-transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: csvData })
      });
      if (!res.ok) throw new Error('API server returned error');
      const data = await res.json();

      setRawTransactions(data.data);

      const categoryTotals: Record<string, number> = {};
      data.data.forEach((item: any) => {
        const cat = item.ai_category;
        let amt = parseFloat(item.amount);
        if (isNaN(amt) || amt <= 0) amt = 10;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      });

      const segments = Object.entries(categoryTotals).map(([label, value], idx) => ({
        label,
        value,
        color: chartColors[idx % chartColors.length]
      }));

      const sortedSegments = segments.sort((a, b) => b.value - a.value);
      setAiChartData(sortedSegments);

      // Fetch LLM Summary
      setIsThinking(true);
      try {
        const sumRes = await fetch(`${API_BASE_URL}/api/generate-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category_totals: categoryTotals })
        });
        const sumData = await sumRes.json();
        setAiSummary(sumData.summary);

        const totalSpend = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
        addHistoryRecord({
          id: Date.now(),
          filename: 'App_Transactions.csv',
          summary: sumData.summary,
          chartData: sortedSegments,
          totalSpend,
          topCategory: sortedSegments[0]?.label || 'N/A',
        });
      } catch (e) {
        setAiSummary("LLM connection unreachable.");
      } finally {
        setIsThinking(false);
      }
    } catch (err: any) {
      setErrorMsg('Failed to analyze app transactions. Is backend running?');
    } finally {
      setIsProcessing(false);
      setProcessingSource(null);
    }
  };

  const handleDownloadPDF = async () => {
    if (aiChartData.length === 0) return;
    setIsDownloading(true);
    try {
      const totals: Record<string, number> = {};
      aiChartData.forEach(s => totals[s.label] = s.value);

      const res = await fetch(`${API_BASE_URL}/api/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_totals: totals,
          ai_summary: aiSummary,
          transactions: rawTransactions
        })
      });
      if (!res.ok) throw new Error('PDF Generation Failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Vyapar-Mitra_Behavioral_Report.pdf');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (e: any) {
      setErrorMsg(e.message || 'PDF extraction failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const portfolioSegments = [
    { label: 'ALGO Holdings', value: inrBalance, color: '#06B6D4' },
    { label: 'Active Positions', value: totalPotentialINR, color: '#8B5CF6' },
    { label: 'Won (Realized)', value: totalWonINR, color: '#22C55E' },
  ].filter(s => s.value > 0);

  const positionSegments = [
    { label: `Active (${activePositions.length})`, value: activePositions.length, color: '#3B82F6' },
    { label: `Won (${wonPositions.length})`, value: wonPositions.length, color: '#22C55E' },
    { label: `Lost (${lostPositions.length})`, value: lostPositions.length, color: '#EF4444' },
  ].filter(s => s.value > 0);

  const totalExpenses = aiChartData.reduce((acc, s) => acc + s.value, 0);

  // ─── Scroll Reveal Hooks ───
  const headerReveal = useReveal({ delay: 0 });
  const aiSectionReveal = useReveal({ delay: 100 });
  const stat0 = useReveal({ delay: 80 });
  const stat1 = useReveal({ delay: 160 });
  const stat2 = useReveal({ delay: 240 });
  const stat3 = useReveal({ delay: 320 });
  const chartsReveal = useReveal({ delay: 150 });
  const rateReveal = useReveal({ delay: 100 });
  const tradesReveal = useReveal({ delay: 200 });

  return (
    <DashboardLayout>
      <div className="px-4 md:px-8 pb-12 pt-6 space-y-8">
        {/* Header */}
        <div ref={headerReveal.ref} className={`flex items-center gap-4 ${revealClass(headerReveal.isVisible, 'left')}`}>
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center text-on-surface shadow-[0_0_20px_rgba(139,92,246,0.3)]">
            <span className="material-symbols-outlined text-[24px]">insights</span>
          </div>
          <div>
            <h2 className="text-3xl font-black font-headline text-on-surface tracking-tight">Financial Analysis</h2>
            <p className="text-sm text-on-surface/50 font-body mt-1">
              {activeAddress
                ? `Pera Wallet · 1 ALGO = ₹${ALGO_TO_INR.toLocaleString()} INR`
                : 'Connect your Pera Wallet to see your financial analysis.'}
            </p>
          </div>
        </div>

        {!activeAddress ? (
          <div className="bg-on-surface/5 backdrop-blur-xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)] rounded-xl p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-slate-600">account_balance_wallet</span>
            <p className="text-on-surface/60 font-body mt-3 font-medium">No wallet connected</p>
            <p className="text-sm text-on-surface/40 font-body mt-1">Connect your Pera Wallet to see analysis.</p>
          </div>
        ) : (
          <>
            {/* AI Analysis Section */}
            <div ref={aiSectionReveal.ref} className={`bg-[#1A1C20]/40 backdrop-blur-2xl border border-on-surface/5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-3xl p-8 relative overflow-hidden group ${revealClass(aiSectionReveal.isVisible, 'scale')}`}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#8B5CF6] opacity-10 rounded-full blur-[100px] group-hover:opacity-20 transition-opacity duration-700"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#3B82F6] opacity-10 rounded-full blur-[100px] group-hover:opacity-20 transition-opacity duration-700"></div>

              <div className="relative z-10">
                {/* Title */}
                <div className="mb-8 text-left max-w-3xl">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined text-[#8B5CF6] text-3xl">auto_awesome</span>
                    <h3 className="text-2xl font-black font-headline text-transparent bg-clip-text bg-gradient-to-r from-white to-on-surface/70 tracking-tight">
                      Predictive Expense Analysis
                      <span className="text-[10px] bg-gradient-to-r from-[#8B5CF6]/20 to-[#3B82F6]/20 text-[#8B5CF6] border border-[#8B5CF6]/30 px-3 py-1 rounded-full ml-4 uppercase tracking-widest align-middle">Beta Plugin</span>
                    </h3>
                  </div>
                  <p className="text-sm text-on-surface/60 font-body leading-relaxed text-lg">
                    Upload your raw expenses spreadsheet (Excel/CSV). Our automated AI model will categorize your spending history and dynamically build your behavioral pattern reports.
                  </p>
                </div>

                {/* Chart + Legend */}
                {aiChartData.length > 0 && (
                  <div className="flex flex-col lg:flex-row items-center justify-start gap-12 bg-[#0E1117]/50 rounded-xl p-8 mb-10 border border-on-surface/10/50">
                    <div className="w-64 h-64 shrink-0">
                      <DonutChart
                        segments={aiChartData}
                        centerLabel="AI Model"
                        centerValue="Done"
                        valueFormatter={(val) => val.toFixed(0)}
                        showLegend={false}
                      />
                    </div>
                    <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      {aiChartData.map((s, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded hover:bg-on-surface/[0.02] transition-colors border-b border-on-surface/[0.05]">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-600 text-xs font-mono w-4">{i + 1}.</span>
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></span>
                            <span className="text-on-surface/70 text-sm font-medium truncate max-w-[120px]">{s.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-on-surface/60 font-body font-mono text-sm">₹{s.value.toLocaleString('en-IN')}</span>
                            <span className="text-on-surface/40 font-body text-xs bg-on-surface/5 backdrop-blur-xl px-1.5 py-0.5 rounded border border-on-surface/10">
                              {((s.value / totalExpenses) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Analyzed Report */}
                {(isThinking || aiSummary) && (
                  <div className="relative mt-4 mb-6 pt-6 border-t border-on-surface/10">
                    <div className="flex items-start gap-4 p-6 bg-gradient-to-r from-[#161B22] to-[#0E1117] rounded-xl border border-[#2962FF]/20 relative overflow-hidden">
                      <div className="absolute -left-12 -top-12 w-32 h-32 bg-[#2962FF]/10 blur-2xl rounded-full"></div>
                      <span className={`material-symbols-outlined shrink-0 text-2xl ${isThinking ? 'animate-pulse text-[#00FFA3]' : 'text-[#2962FF]'}`}>smart_toy</span>
                      <div className="flex-1">
                        <h4 className="text-base font-bold font-headline text-on-surface tracking-tight flex items-center gap-3 mb-4">
                          Analyzed Report
                          {isThinking && <span className="text-[10px] bg-[#2962FF]/20 text-[#2962FF] px-2 py-0.5 rounded tracking-wider animate-pulse">THINKING</span>}
                          {!isThinking && aiSummary && (
                            <button
                              onClick={handleSpeak}
                              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                                isSpeaking
                                  ? 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/25 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                                  : 'bg-[#00FFA3]/10 text-[#00FFA3] border-[#00FFA3]/30 hover:bg-[#00FFA3]/20 shadow-[0_0_12px_rgba(0,255,163,0.1)]'
                              }`}
                              title={isSpeaking ? 'Stop speaking' : 'Read report aloud'}
                            >
                              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                {isSpeaking ? 'stop_circle' : 'volume_up'}
                              </span>
                              {isSpeaking ? 'Stop' : 'Listen'}
                            </button>
                          )}
                        </h4>
                        <div className="text-sm text-on-surface/70 leading-relaxed font-medium space-y-3">
                          {isThinking ? (
                            <p className="italic text-on-surface/40 font-body">LLM is analyzing patterns...</p>
                          ) : (
                            aiSummary.split('\n').filter(line => line.trim().length > 0).map((line, idx) => {
                              const cleanLine = line.replace(/[*#_]/g, '');
                              if (cleanLine.trim().startsWith('-') || cleanLine.trim().startsWith('•')) {
                                return <p key={idx} className="ml-4 flex items-start gap-2"><span className="text-[#00FFA3] shrink-0 mt-0.5">•</span> <span>{cleanLine.replace(/^[-•]/, '').trim()}</span></p>;
                              }
                              return <p key={idx}>{cleanLine.trim()}</p>;
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-start gap-4 mt-10 pt-8 border-t border-on-surface/5">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className={`inline-flex items-center gap-2 ${isProcessing ? 'bg-slate-600 cursor-not-allowed' : 'bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] cursor-pointer hover:scale-[1.02] active:scale-[0.98]'} text-on-surface text-sm font-bold px-8 py-4 rounded-2xl transition-all`}>
                      <span className="material-symbols-outlined text-[20px]">
                        {processingSource === 'upload' ? 'hourglass_empty' : 'upload_file'}
                      </span>
                      {processingSource === 'upload' ? 'AI Processing...' : 'Upload Excel/CSV'}
                      <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={isProcessing} />
                    </label>
                    <button 
                      onClick={handleAppTransactions}
                      disabled={isProcessing}
                      className={`inline-flex items-center gap-2 ${isProcessing ? 'bg-slate-600 cursor-not-allowed' : 'bg-on-surface/5 backdrop-blur-xl border border-on-surface/10 hover:bg-on-surface/10 hover:border-on-surface/20 cursor-pointer'} text-on-surface text-sm font-bold px-8 py-4 rounded-2xl transition-all shadow-lg`}
                    >
                      <span className="material-symbols-outlined text-[20px] text-[#3B82F6]">
                        {processingSource === 'app' ? 'hourglass_empty' : 'database'}
                      </span>
                      {processingSource === 'app' ? 'Processing App Data...' : 'Analyze App Transactions'}
                    </button>
                    {errorMsg && <p className="text-xs text-[#EF4444] font-semibold w-full mt-1">{errorMsg}</p>}
                  </div>

                  {aiChartData.length > 0 && (
                    <button
                      onClick={handleDownloadPDF}
                      disabled={isDownloading || isThinking}
                      className={`flex items-center gap-2 ml-auto ${isDownloading || isThinking ? 'bg-slate-800 text-on-surface/40 font-body cursor-not-allowed border-on-surface/10' : 'bg-transparent border border-[#3B82F6]/50 text-[#3B82F6] hover:bg-[#3B82F6]/10 shadow-[0_4px_20px_rgba(59,130,246,0.15)]'} border font-bold py-4 px-8 rounded-2xl text-sm uppercase tracking-widest transition-all`}
                    >
                      <span className={`material-symbols-outlined text-[18px] ${isDownloading || isThinking ? 'animate-spin' : ''}`}>
                        {isDownloading || isThinking ? 'sync' : 'picture_as_pdf'}
                      </span>
                      {isDownloading ? 'Generating...' : (isThinking ? 'Waiting...' : 'Download Report')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── History Section ── */}
            {history.length > 0 && (
              <div className="bg-gradient-to-br from-[#161B22] to-[#0E1117] border border-on-surface/10 shadow-lg rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-[#00FFA3]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="flex items-center gap-3 mb-6 relative z-10">
                  <span className="material-symbols-outlined text-[#00FFA3] text-2xl">history</span>
                  <h3 className="text-xl font-bold font-headline text-on-surface tracking-tight uppercase tracking-wide">Previous Analysis Records</h3>
                  <span className="text-[10px] bg-[#00FFA3]/10 text-[#00FFA3] border border-[#00FFA3]/20 px-2 py-0.5 rounded font-bold">{history.length} UPLOADS</span>
                </div>
                <div className="space-y-3 relative z-10 max-h-[420px] overflow-y-auto pr-1">
                  {history.map((record, idx) => (
                    <div key={record.id} className={`bg-[#0E1117] rounded-xl p-5 border transition-colors ${idx === 0 ? 'border-[#2962FF]/40' : 'border-on-surface/10 hover:border-[#00FFA3]/30'}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-on-surface/10/50">
                        <div className="flex items-center gap-3">
                          {idx === 0 && <span className="text-[9px] bg-[#2962FF]/20 text-[#2962FF] border border-[#2962FF]/30 px-1.5 py-0.5 rounded font-bold">LATEST</span>}
                          <span className="material-symbols-outlined text-[#2962FF] text-[18px]">draft</span>
                          <h4 className="text-on-surface/70 font-bold text-sm">{record.filename}</h4>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-on-surface/40 font-body text-xs">Top: <span className="text-[#F59E0B] font-bold">{record.topCategory}</span></span>
                          <span className="text-[#00FFA3] text-[10px] px-2 py-0.5 bg-[#00FFA3]/10 border border-[#00FFA3]/20 rounded font-bold">
                            {new Date(record.id).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex gap-2 flex-wrap">
                          {record.chartData.slice(0, 4).map((seg, si) => (
                            <span key={si} className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: seg.color + '22', color: seg.color, border: `1px solid ${seg.color}44` }}>
                              {seg.label}
                            </span>
                          ))}
                          {record.chartData.length > 4 && <span className="text-[10px] px-2 py-0.5 text-on-surface/40 font-body">+{record.chartData.length - 4} more</span>}
                        </div>
                        <span className="text-xs text-on-surface/40 font-body font-mono sm:ml-auto">Total: <span className="text-on-surface/70 font-bold">₹{record.totalSpend.toLocaleString('en-IN')}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'ALGO Balance', val: `${algoBalance.toFixed(2)} ALGO`, sub: inr(inrBalance), color: 'text-primary', icon: 'account_balance_wallet', rev: stat0 },
                { label: 'Net Worth (INR)', val: inr(netWorthINR), sub: `at ₹${ALGO_TO_INR.toLocaleString()}/ALGO`, color: 'text-[#8B5CF6]', icon: 'trending_up', rev: stat1 },
                { label: 'Total Wagered', val: inr(totalWageredINR), sub: `${myTrades.length} trades`, color: 'text-[#3B82F6]', icon: 'casino', rev: stat2 },
                { label: 'Potential Payout', val: inr(totalPotentialINR), sub: `${activePositions.length} active`, color: 'text-[#22C55E]', icon: 'payments', rev: stat3 },
              ].map(({ label, val, sub, color, icon, rev }) => (
                <div ref={rev.ref} key={label} className={`bg-on-surface/5 backdrop-blur-2xl border border-on-surface/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] rounded-3xl p-6 relative overflow-hidden group hover:border-on-surface/20 transition-colors ${revealClass(rev.isVisible, 'up')}`}>
                  <div className="absolute -top-10 -right-10 w-32 h-32 opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity duration-700" style={{ background: color.replace('text-', '') }} />
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-on-surface/50 font-body font-bold uppercase tracking-widest">{label}</p>
                    <div className="bg-on-surface/5 p-2 rounded-xl border border-on-surface/5">
                      <span className={`material-symbols-outlined text-[20px] ${color}`}>{icon}</span>
                    </div>
                  </div>
                  <p className={`text-3xl font-black font-headline tracking-tight ${color}`}>{balanceLoading && label === 'ALGO Balance' ? '…' : val}</p>
                  {sub && <p className="text-sm text-on-surface/40 font-body mt-2">{sub}</p>}
                </div>
              ))}
            </div>

            {/* Charts */}
            <div ref={chartsReveal.ref} className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${revealClass(chartsReveal.isVisible, 'up')}`}>
              <div className="bg-on-surface/5 backdrop-blur-2xl border border-on-surface/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] rounded-3xl p-8">
                <h3 className="text-lg font-black font-headline text-on-surface tracking-tight mb-8 flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">pie_chart</span>
                  Portfolio Allocation
                </h3>
                {portfolioSegments.length > 0 ? (
                  <DonutChart segments={portfolioSegments} centerLabel="Net Worth" centerValue={inr(netWorthINR)} valueFormatter={inr} />
                ) : (
                  <p className="text-sm text-on-surface/40 font-body text-center py-12 bg-on-surface/5 rounded-2xl border border-on-surface/5">No portfolio data yet.</p>
                )}
              </div>
              <div className="bg-on-surface/5 backdrop-blur-2xl border border-on-surface/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] rounded-3xl p-8">
                <h3 className="text-lg font-black font-headline text-on-surface tracking-tight mb-8 flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#3B82F6]">donut_large</span>
                  Prediction Position Breakdown
                </h3>
                {positionSegments.length > 0 ? (
                  <DonutChart segments={positionSegments} centerLabel="Positions" centerValue={String(activePositions.length + wonPositions.length + lostPositions.length)} valueFormatter={v => v.toFixed(0)} />
                ) : (
                  <p className="text-sm text-on-surface/40 font-body text-center py-12 bg-on-surface/5 rounded-2xl border border-on-surface/5">No predictions placed yet.</p>
                )}
              </div>
            </div>

            {/* ALGO Rate Card */}
            <div ref={rateReveal.ref} className={`bg-gradient-to-r from-[#2962FF]/10 to-[#00FFA3]/5 border border-[#2962FF]/20 rounded-xl p-5 ${revealClass(rateReveal.isVisible, 'fade')}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#2962FF]">info</span>
                <h3 className="font-bold font-headline text-on-surface tracking-tight">Valuation Basis</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><p className="text-xs text-on-surface/40 font-body">Rate Used</p><p className="font-bold text-[#2962FF]">1 ALGO = ₹{ALGO_TO_INR.toLocaleString()}</p></div>
                <div><p className="text-xs text-on-surface/40 font-body">Your ALGO</p><p className="font-bold font-headline text-on-surface tracking-tight">{algoBalance.toFixed(4)}</p></div>
                <div><p className="text-xs text-on-surface/40 font-body">INR Value</p><p className="font-bold text-[#22C55E]">{inr(inrBalance)}</p></div>
                <div><p className="text-xs text-on-surface/40 font-body">Network</p><p className="font-bold font-headline text-on-surface tracking-tight">Algorand Testnet</p></div>
              </div>
            </div>

            {/* Recent Trades */}
            {myTrades.length > 0 && (
              <div ref={tradesReveal.ref} className={`bg-on-surface/5 backdrop-blur-xl border border-on-surface/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)] rounded-xl overflow-hidden ${revealClass(tradesReveal.isVisible, 'up')}`}>
                <div className="p-5 border-b border-on-surface/10 flex items-center justify-between">
                  <h3 className="font-bold font-headline text-on-surface tracking-tight">Recent Trade Activity</h3>
                  <span className="text-xs text-on-surface/40 font-body">{myTrades.length} total</span>
                </div>
                <div className="overflow-y-auto max-h-72 divide-y divide-white/10">
                  {myTrades.slice(0, 10).map((t, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-[#1F2630] transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`material-symbols-outlined text-base ${t.side === 'buy' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                          {t.side === 'buy' ? 'arrow_downward' : 'arrow_upward'}
                        </span>
                        <div>
                          <p className="text-sm text-on-surface/80 font-medium">{t.symbol}</p>
                          <p className="text-xs text-on-surface/40 font-body uppercase">{t.side} · {t.assetType}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${t.side === 'buy' ? 'text-[#EF4444]' : 'text-[#22C55E]'}`}>
                          {t.side === 'buy' ? '-' : '+'}{t.algoAmount.toFixed(2)} ALGO
                        </p>
                        <p className="text-xs text-on-surface/40 font-body">{inr(t.algoAmount * ALGO_TO_INR)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
