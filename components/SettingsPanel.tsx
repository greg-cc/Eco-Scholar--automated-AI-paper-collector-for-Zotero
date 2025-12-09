
import React, { useState, useEffect, useRef } from 'react';
import { AppConfig, SemanticSentence, NetworkLog } from '../types';
import { GEMINI_MODELS } from '../constants';
import { Save, RefreshCw, Cpu, Globe, Trash2, Plus, Upload, Zap, FastForward, BookOpen, FileText, Loader2, CheckCircle, XCircle, Server, Ban } from 'lucide-react';
import { OllamaService } from '../services/ollamaService';
import { clsx } from 'clsx';

interface SettingsPanelProps {
  config: AppConfig;
  onUpdate: (config: AppConfig) => void;
  onLog?: (log: NetworkLog) => void;
}

interface SavedPreset {
    name: string;
    config: AppConfig;
    date: number;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ config, onUpdate, onLog }) => {
  const [localConfig, setLocalConfig] = useState(config);
  
  // Preset State
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState('');

  // New Sentence State
  const [newSentenceText, setNewSentenceText] = useState('');
  const [newSentenceTag, setNewSentenceTag] = useState('');
  const [newSentenceType, setNewSentenceType] = useState<'positive' | 'negative'>('positive');
  
  // Grading Topics State
  const [gradingTopicsStr, setGradingTopicsStr] = useState(config.gradingTopics.join(', '));
  
  // Testing State
  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  
  // Ref for canceling test
  const testAbortController = useRef<AbortController | null>(null);

  // Load presets on mount
  useEffect(() => {
    const saved = localStorage.getItem('ecoscholar_presets');
    if (saved) {
        try {
            setPresets(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to load presets");
        }
    }
    
    // Cleanup on unmount
    return () => {
        if (testAbortController.current) testAbortController.current.abort();
    };
  }, []);

  // Sync grading topics text
  useEffect(() => {
      setGradingTopicsStr(localConfig.gradingTopics.join(', '));
  }, [localConfig.gradingTopics]);

  const savePreset = () => {
    if (!presetName) return;
    const newPreset: SavedPreset = {
        name: presetName,
        config: localConfig,
        date: Date.now()
    };
    const updatedPresets = [...presets.filter(p => p.name !== presetName), newPreset];
    setPresets(updatedPresets);
    localStorage.setItem('ecoscholar_presets', JSON.stringify(updatedPresets));
    setPresetName('');
    alert(`Configuration '${presetName}' saved!`);
  };

  const loadPreset = (p: SavedPreset) => {
      if (confirm(`Load configuration '${p.name}'? Unsaved changes will be lost.`)) {
          setLocalConfig(p.config);
      }
  };

  const deletePreset = (name: string) => {
      if (confirm(`Delete preset '${name}'?`)) {
          const updated = presets.filter(p => p.name !== name);
          setPresets(updated);
          localStorage.setItem('ecoscholar_presets', JSON.stringify(updated));
      }
  }

  // Sentence Management
  const handleSentenceToggle = (id: string) => {
    const updated = localConfig.semanticSentences.map(s => 
        s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    setLocalConfig({ ...localConfig, semanticSentences: updated });
  };

  const handleDeleteSentence = (id: string) => {
      if (confirm("Remove this sentence rule?")) {
        const updated = localConfig.semanticSentences.filter(s => s.id !== id);
        setLocalConfig({ ...localConfig, semanticSentences: updated });
      }
  };

  const handleAddSentence = () => {
      if (!newSentenceText || !newSentenceTag) return;
      const newSentence: SemanticSentence = {
          id: `custom-${Date.now()}`,
          text: newSentenceText,
          customTag: newSentenceTag,
          positive: newSentenceType === 'positive',
          enabled: true
      };
      setLocalConfig({
          ...localConfig,
          semanticSentences: [...localConfig.semanticSentences, newSentence]
      });
      setNewSentenceText('');
      setNewSentenceTag('');
  };

  const handleGradingTopicsChange = (val: string) => {
      setGradingTopicsStr(val);
      const topics = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
      setLocalConfig(prev => ({ ...prev, gradingTopics: topics }));
  };

  const handleTestOllama = async () => {
    if (testAbortController.current) testAbortController.current.abort();
    testAbortController.current = new AbortController();
    
    console.log("Starting Ollama Test...");
    setIsTestingOllama(true);
    setTestStatus('idle');
    setTestMessage('');

    try {
        const service = new OllamaService(
            localConfig.ollamaBaseUrl, 
            localConfig.ollamaModel, 
            localConfig.ollamaEmbeddingModel,
            onLog 
        );
        console.log("Service initialized with:", localConfig.ollamaBaseUrl);
        
        const models = await service.listModels(testAbortController.current.signal);
        
        const hasGen = models.some((m: any) => m.name.includes(localConfig.ollamaModel));
        const hasEmbed = models.some((m: any) => m.name.includes(localConfig.ollamaEmbeddingModel));
        
        let msg = `Connected! Found ${models.length} models.`;
        if (!hasGen) msg += ` Warning: '${localConfig.ollamaModel}' not found.`;
        if (!hasEmbed) msg += ` Warning: '${localConfig.ollamaEmbeddingModel}' not found.`;

        setTestStatus('success');
        setTestMessage(msg);

    } catch (e: any) {
        if (e.name === 'AbortError') {
            setTestStatus('error');
            setTestMessage("Test Cancelled by user.");
            return;
        }
        console.error("Test Failed:", e);
        setTestStatus('error');
        setTestMessage(e.message || "Connection failed");
    } finally {
        setIsTestingOllama(false);
        testAbortController.current = null;
    }
  };

  const handleStopTest = () => {
      if (testAbortController.current) {
          testAbortController.current.abort();
      }
  };

  const handleSave = () => {
    onUpdate(localConfig);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-8 animate-fadeIn">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <RefreshCw size={20} /> System Configuration
        </h2>
      </div>

      {/* --- PRESET MANAGEMENT --- */}
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Configuration Presets</h3>
          
          <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                placeholder="Preset Name (e.g. 'Malaria Research')" 
                className="flex-1 p-2 border border-slate-300 rounded text-sm"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <button onClick={savePreset} className="bg-slate-800 text-white px-4 py-2 rounded text-sm hover:bg-slate-900 flex items-center gap-2">
                  <Save size={14} /> Save Current
              </button>
          </div>

          {presets.length > 0 && (
              <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500">Saved Configs:</label>
                  <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                      {presets.map(p => (
                          <div key={p.name} className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 text-sm">
                              <span className="font-medium text-slate-700">{p.name} <span className="text-slate-400 font-normal text-xs">({new Date(p.date).toLocaleDateString()})</span></span>
                              <div className="flex gap-2">
                                  <button onClick={() => loadPreset(p)} className="text-blue-600 hover:text-blue-800 text-xs font-bold px-2">LOAD</button>
                                  <button onClick={() => deletePreset(p.name)} className="text-red-500 hover:text-red-700"><Trash2 size={14}/></button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>

      {/* --- PROVIDER --- */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">AI Provider</label>
        <div className="flex gap-4">
            <button
                onClick={() => setLocalConfig({...localConfig, provider: 'gemini'})}
                className={clsx(
                    "flex-1 p-3 rounded-lg border flex items-center justify-center gap-2 transition-all",
                    localConfig.provider === 'gemini' 
                        ? "bg-blue-50 border-blue-500 text-blue-700 font-semibold" 
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
            >
                <Globe size={18} /> Google Gemini
            </button>
            <button
                onClick={() => setLocalConfig({...localConfig, provider: 'ollama'})}
                className={clsx(
                    "flex-1 p-3 rounded-lg border flex items-center justify-center gap-2 transition-all",
                    localConfig.provider === 'ollama' 
                        ? "bg-orange-50 border-orange-500 text-orange-700 font-semibold" 
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
            >
                <Cpu size={18} /> Local Ollama
            </button>
        </div>
      </div>

      {/* API Key / URL Config */}
      {localConfig.provider === 'gemini' ? (
        <div className="animate-fadeIn space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gemini API Key</label>
                <input 
                    type="password" 
                    value={localConfig.geminiApiKey} 
                    onChange={(e) => setLocalConfig({...localConfig, geminiApiKey: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="AIza..."
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gemini Model</label>
                <select
                    value={localConfig.geminiModel}
                    onChange={(e) => setLocalConfig({...localConfig, geminiModel: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
                >
                    {GEMINI_MODELS.map(m => (
                        <option key={m.value} value={m.value}>
                            {m.label}
                        </option>
                    ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                    {GEMINI_MODELS.find(m => m.value === localConfig.geminiModel)?.desc}
                </p>
            </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Ollama Base URL</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={localConfig.ollamaBaseUrl} 
                        onChange={(e) => setLocalConfig({...localConfig, ollamaBaseUrl: e.target.value})}
                        className="flex-1 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                    {isTestingOllama ? (
                        <button 
                            onClick={handleStopTest}
                            className="px-3 py-2 bg-red-100 border border-red-300 rounded text-red-700 font-bold text-xs hover:bg-red-200 min-w-[80px] flex items-center justify-center gap-2"
                        >
                            <Ban size={14} /> Stop
                        </button>
                    ) : (
                        <button 
                            onClick={handleTestOllama}
                            className="px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-700 font-bold text-xs hover:bg-slate-200 min-w-[80px] flex items-center justify-center gap-2"
                        >
                            Test
                        </button>
                    )}
                </div>
                {/* Status Message */}
                {testStatus !== 'idle' && (
                    <div className={clsx("mt-2 text-xs flex items-center gap-1 font-medium", testStatus === 'success' ? "text-green-600" : "text-red-600")}>
                        {testStatus === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {testMessage}
                    </div>
                )}
            </div>
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gen Model</label>
                <input 
                    type="text" 
                    value={localConfig.ollamaModel} 
                    onChange={(e) => setLocalConfig({...localConfig, ollamaModel: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-orange-500 outline-none"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Embed Model</label>
                <input 
                    type="text" 
                    value={localConfig.ollamaEmbeddingModel} 
                    onChange={(e) => setLocalConfig({...localConfig, ollamaEmbeddingModel: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-orange-500 outline-none"
                />
            </div>
        </div>
      )}

      <hr className="border-slate-200" />

      {/* ... Zotero & Rest ... */}
      {/* (Rest of component remains largely the same, included for context completeness) */}
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn">
         <div className="flex justify-between items-start mb-3">
             <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <BookOpen size={16} className="text-slate-600" /> Zotero Integration
             </h3>
             <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                <input 
                    type="checkbox"
                    checked={localConfig.useLocalZotero}
                    onChange={(e) => setLocalConfig({...localConfig, useLocalZotero: e.target.checked})}
                    className="text-red-600 focus:ring-red-500 rounded"
                />
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Server size={12} /> Use Local API
                </span>
             </label>
         </div>

         {!localConfig.useLocalZotero ? (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                 <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Zotero API Key (Cloud)</label>
                    <input 
                        type="password" 
                        value={localConfig.zoteroApiKey || ''}
                        onChange={(e) => setLocalConfig({...localConfig, zoteroApiKey: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Key..."
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">User ID / Library ID</label>
                    <input 
                        type="text" 
                        value={localConfig.zoteroLibraryId || ''}
                        onChange={(e) => setLocalConfig({...localConfig, zoteroLibraryId: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="1234567"
                    />
                 </div>
             </div>
         ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn bg-red-50 p-3 rounded border border-red-100">
                 <div className="md:col-span-2 text-[10px] text-red-800 mb-1">
                     Configure connection to a local Zotero instance (e.g., Zotero Client with Citation Server or a Dockerized Data Server).
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">IP Address</label>
                    <input 
                        type="text" 
                        value={localConfig.zoteroIp}
                        onChange={(e) => setLocalConfig({...localConfig, zoteroIp: e.target.value})}
                        className="w-full p-2 border border-red-300 rounded text-sm focus:ring-2 focus:ring-red-500 outline-none"
                        placeholder="127.0.0.1"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Port</label>
                    <input 
                        type="text" 
                        value={localConfig.zoteroPort}
                        onChange={(e) => setLocalConfig({...localConfig, zoteroPort: e.target.value})}
                        className="w-full p-2 border border-red-300 rounded text-sm focus:ring-2 focus:ring-red-500 outline-none"
                        placeholder="23119"
                    />
                 </div>
                 <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Library ID (Optional for Local)</label>
                    <input 
                        type="text" 
                        value={localConfig.zoteroLibraryId || ''}
                        onChange={(e) => setLocalConfig({...localConfig, zoteroLibraryId: e.target.value})}
                        className="w-full p-2 border border-red-300 rounded text-sm focus:ring-2 focus:ring-red-500 outline-none"
                        placeholder="0 or 1234567"
                    />
                 </div>
             </div>
         )}
      </div>

      <hr className="border-slate-200" />

      {/* --- SMART SPEED UP & FAIL FAST --- */}
      <div className="bg-gradient-to-r from-slate-50 to-white p-4 rounded-lg border border-slate-200">
         <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide flex items-center gap-2">
            <Zap size={16} className="text-orange-500" /> Smart Speed Up & Fail Fast
         </h3>
         
         <div className="flex flex-col gap-4">
             {/* Controls Row */}
             <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <div className="text-sm text-slate-600">
                        <span className="font-medium">Turbo Mode:</span> Auto-skips AI if <span className="font-mono text-purple-600">{(localConfig.turboQualifyRate * 100).toFixed(0)}%</span> of first papers qualify.
                    </div>
                 </div>

                 {/* Fail Fast Checkbox */}
                 <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-300 shadow-sm">
                    <input 
                        type="checkbox" 
                        id="failFast"
                        checked={localConfig.failFast}
                        onChange={(e) => setLocalConfig({...localConfig, failFast: e.target.checked})}
                        className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                    />
                    <label htmlFor="failFast" className="text-sm font-medium text-slate-700 cursor-pointer flex items-center gap-1">
                        <FastForward size={14} className="text-orange-600" /> Fail Fast (Skip Query)
                    </label>
                 </div>
             </div>

             {/* Turbo Qualify Rate Slider */}
             <div>
                <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-slate-500">Qualify Rate (Confidence Threshold)</label>
                    <span className="text-xs font-mono text-purple-600 font-bold">{(localConfig.turboQualifyRate * 100).toFixed(0)}%</span>
                </div>
                <input 
                    type="range" step="0.05" min="0" max="1"
                    value={localConfig.turboQualifyRate}
                    onChange={(e) => setLocalConfig({...localConfig, turboQualifyRate: parseFloat(e.target.value)})}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
            </div>

             {/* Threshold Slider */}
             <div>
                <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-slate-500">Sample Size (First N Papers)</label>
                    <span className="text-xs font-mono text-slate-600">{localConfig.turboThresholdCount}</span>
                </div>
                <input 
                    type="range" step="1" min="5" max="50"
                    value={localConfig.turboThresholdCount}
                    onChange={(e) => setLocalConfig({...localConfig, turboThresholdCount: parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                />
            </div>
         </div>
      </div>

      <hr className="border-slate-200" />
      
      {/* --- GRADING TOPICS (Moved Up) --- */}
      <div>
         <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide flex items-center gap-2">
            <FileText size={16} className="text-slate-600" /> AI Grading Topics
         </h3>
         <p className="text-xs text-slate-500 mb-2">The AI uses this list of keywords to calculate the <strong>Discovery Probability</strong> score. Papers relevant to these topics with novel findings receive higher probability scores. Separate topics with commas.</p>
         <textarea 
            value={gradingTopicsStr}
            onChange={(e) => handleGradingTopicsChange(e.target.value)}
            className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            rows={5}
         />
      </div>

      <hr className="border-slate-200" />

      {/* --- SCORING THRESHOLDS --- */}
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Scoring & Filtering Logic</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
            <div className="flex justify-between mb-1">
                <label className="text-sm font-medium text-slate-700">Min Vector Score</label>
                <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{localConfig.minVectorScore.toFixed(2)}</span>
            </div>
            <input 
                type="range" step="0.05" min="0" max="1"
                value={localConfig.minVectorScore}
                onChange={(e) => setLocalConfig({...localConfig, minVectorScore: parseFloat(e.target.value)})}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
        </div>

        <div>
            <div className="flex justify-between mb-1">
                <label className="text-sm font-medium text-slate-700">Min Composite Score</label>
                <span className="text-xs font-mono text-green-600 bg-green-50 px-2 py-0.5 rounded">{localConfig.minCompositeScore.toFixed(2)}</span>
            </div>
            <input 
                type="range" step="0.1" min="0" max="6"
                value={localConfig.minCompositeScore}
                onChange={(e) => setLocalConfig({...localConfig, minCompositeScore: parseFloat(e.target.value)})}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-600"
            />
        </div>

         <div className="md:col-span-2 bg-orange-50/50 p-3 rounded-lg border border-orange-100">
            <div className="flex justify-between mb-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1">Discovery Probability <span className="text-[10px] font-normal text-slate-500">(Based on Grading Topics)</span></label>
                <span className="text-xs font-mono text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">{localConfig.minProbabilityScore}/10</span>
            </div>
            <p className="text-[10px] text-slate-500 mb-2">Adjust this slider to filter papers based on the AI's judgment of novelty regarding your topics. Set to 0 to rely solely on the presence of phytochemicals/plants.</p>
            <input 
                type="range" step="1" min="0" max="10"
                value={localConfig.minProbabilityScore}
                onChange={(e) => setLocalConfig({...localConfig, minProbabilityScore: parseInt(e.target.value)})}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* --- SENTENCE MANAGEMENT --- */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Semantic Vector Rules</label>
        
        {/* Existing Sentences List */}
        <div className="space-y-3 mb-6 max-h-80 overflow-y-auto pr-2">
            {localConfig.semanticSentences.map(s => (
                <div key={s.id} className="group relative flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-blue-200 transition-colors">
                    <input 
                        type="checkbox" 
                        checked={s.enabled} 
                        onChange={() => handleSentenceToggle(s.id)}
                        className="mt-1.5"
                    />
                    <div className="flex-1">
                        <p className={`text-sm text-slate-800 ${!s.enabled && 'opacity-50 line-through'}`}>{s.text}</p>
                        <div className="flex gap-2 mt-1">
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${s.positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {s.positive ? 'Positive' : 'Negative'}
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                                {s.customTag}
                            </span>
                        </div>
                    </div>
                    <button 
                        onClick={() => handleDeleteSentence(s.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all absolute top-2 right-2"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            ))}
        </div>

        {/* Add New Sentence */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Add New Semantic Rule</h4>
            <div className="space-y-3">
                <textarea 
                    placeholder="Enter full sentence (e.g. 'This paper discusses clinical trials.')"
                    className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    rows={2}
                    value={newSentenceText}
                    onChange={e => setNewSentenceText(e.target.value)}
                />
                <div className="flex gap-3">
                    <input 
                        type="text" 
                        placeholder="Tag (e.g. 'Clinical')"
                        className="flex-1 p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newSentenceTag}
                        onChange={e => setNewSentenceTag(e.target.value)}
                    />
                    <select 
                        value={newSentenceType}
                        onChange={(e: any) => setNewSentenceType(e.target.value)}
                        className="p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                        <option value="positive">Requirement (Positive)</option>
                        <option value="negative">Penalty (Negative)</option>
                    </select>
                    <button 
                        onClick={handleAddSentence}
                        disabled={!newSentenceText || !newSentenceTag}
                        className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                        <Plus size={16} /> Add
                    </button>
                </div>
            </div>
        </div>
      </div>

      <button 
        onClick={handleSave}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg hover:shadow-blue-200 transition-all flex items-center justify-center gap-2"
      >
        <Upload size={18} /> Apply Configuration
      </button>
    </div>
  );
};

export default SettingsPanel;
