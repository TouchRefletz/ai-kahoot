import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleGenAI, Type } from '@google/genai';
import { doc, setDoc, collection, onSnapshot, query, orderBy, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { Upload, FileText, Trash2, Play, Users, BrainCircuit, RefreshCw, AlertCircle, Settings, ChevronRight, Trophy, X } from 'lucide-react';
import { cn } from '../lib/utils';
import confetti from 'canvas-confetti';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export default function Host() {
  const navigate = useNavigate();
  const [gameId, setGameId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [caveats, setCaveats] = useState('');
  const [numQuestions, setNumQuestions] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('custom_gemini_key') || '');

  // Game State
  const [gameState, setGameState] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!auth.currentUser) {
      navigate('/');
      return;
    }

    // Create game on mount
    const newGameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setGameId(newGameId);

    const initGame = async () => {
      try {
        await setDoc(doc(db, 'games', newGameId), {
          hostUid: auth.currentUser!.uid,
          status: 'lobby',
          currentQuestionIndex: 0,
          history: [],
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `games/${newGameId}`);
      }
    };
    initGame();

    // Listeners
    const unsubGame = onSnapshot(doc(db, 'games', newGameId), (doc) => {
      if (doc.exists()) setGameState(doc.data());
    }, (err) => handleFirestoreError(err, OperationType.GET, `games/${newGameId}`));

    const unsubPlayers = onSnapshot(collection(db, `games/${newGameId}/players`), (snap) => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.score - a.score));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `games/${newGameId}/players`));

    const unsubQuestions = onSnapshot(query(collection(db, `games/${newGameId}/questions`), orderBy('index')), (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `games/${newGameId}/questions`));

    return () => {
      unsubGame();
      unsubPlayers();
      unsubQuestions();
    };
  }, [navigate]);

  const isEndingQuestion = useRef(false);

  // Timer logic
  useEffect(() => {
    if (gameState?.status === 'question' && gameState?.questionStartTime) {
      isEndingQuestion.current = false;
      const currentQ = questions[gameState.currentQuestionIndex];
      if (!currentQ) return;

      const interval = setInterval(async () => {
        if (isEndingQuestion.current) return;

        const start = new Date(gameState.questionStartTime).getTime();
        const now = new Date().getTime();
        const elapsed = Math.floor((now - start) / 1000);
        const remaining = currentQ.timeLimit - elapsed;

        const allAnswered = players.length > 0 && players.every(p => p.currentAnswer !== null && p.currentAnswer !== -1);

        if (remaining <= 0 || allAnswered) {
          isEndingQuestion.current = true;
          setTimeLeft(0);
          clearInterval(interval);
          
          // Calculate scores for all players
          const batch = writeBatch(db);
          players.forEach(p => {
            const pRef = doc(db, `games/${gameId}/players`, p.id);
            if (p.currentAnswer !== null && p.currentAnswer !== -1) {
              const isCorrect = p.currentAnswer === currentQ.correctAnswerIndex;
              
              let points = 0;
              if (isCorrect) {
                const answeredAt = p.answeredAt ? new Date(p.answeredAt).getTime() : now;
                const timeTaken = Math.max((answeredAt - start) / 1000, 0);
                const timeRatio = Math.min(timeTaken / currentQ.timeLimit, 1);
                // Kahoot-like scoring: max 1000, min 500 for correct answer
                points = Math.round((1 - (timeRatio / 2)) * 1000);
              }

              batch.update(pRef, {
                score: p.score + points,
                lastAnswerCorrect: isCorrect,
                lastScoreAdded: points,
                currentAnswer: -1 // Reset for next question
              });
            } else {
              // Timeout
              batch.update(pRef, {
                lastAnswerCorrect: false,
                lastScoreAdded: 0,
                currentAnswer: -1
              });
            }
          });
          
          batch.update(doc(db, 'games', gameId!), { status: 'leaderboard' });
          await batch.commit().catch(e => console.error(e));
          
        } else {
          setTimeLeft(remaining);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [gameState?.status, gameState?.questionStartTime, gameState?.currentQuestionIndex, questions, gameId, players]);

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files!)]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const generateQuestions = async () => {
    if (files.length === 0) {
      setError('Adicione pelo menos um documento.');
      return;
    }

    const apiKeyToUse = customApiKey.trim() || process.env.GEMINI_API_KEY;
    if (!apiKeyToUse) {
      setError('Nenhuma chave de API configurada. Adicione sua chave nas configurações.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
      await updateDoc(doc(db, 'games', gameId!), { status: 'generating' });

      const parts: any[] = await Promise.all(
        files.map(async (file) => ({
          inlineData: {
            data: await fileToBase64(file),
            mimeType: file.type || 'application/octet-stream',
          },
        }))
      );

      const prompt = `
      Crie ${numQuestions} questões de múltipla escolha estilo Kahoot.
      ${caveats ? `INSTRUÇÕES ESPECIAIS DO PROFESSOR: ${caveats}` : ''}
      
      REGRAS:
      1. JSON com lista de questões.
      2. 4 opções, 1 correta (índice 0 a 3).
      3. NUNCA repita estas questões:
      ${gameState?.history?.length > 0 ? gameState.history.join('\n') : 'Nenhuma ainda.'}
      4. APENAS JSON válido.
      `;

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    choices: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctAnswerIndex: { type: Type.INTEGER },
                    timeLimit: { type: Type.INTEGER }
                  },
                  required: ["question", "choices", "correctAnswerIndex", "timeLimit"]
                }
              }
            },
            required: ["questions"]
          }
        }
      });

      const parsed = JSON.parse(response.text!);
      
      const batch = writeBatch(db);
      const startIndex = questions.length;
      
      parsed.questions.forEach((q: any, i: number) => {
        const qRef = doc(collection(db, `games/${gameId}/questions`));
        batch.set(qRef, { ...q, index: startIndex + i });
      });

      const newHistory = [...(gameState?.history || []), ...parsed.questions.map((q: any) => q.question)];
      batch.update(doc(db, 'games', gameId!), { 
        history: newHistory,
        status: 'lobby'
      });

      await batch.commit();

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      await updateDoc(doc(db, 'games', gameId!), { status: 'lobby' });
    } finally {
      setLoading(false);
    }
  };

  const startGame = async () => {
    if (questions.length === 0) return;
    try {
      await updateDoc(doc(db, 'games', gameId!), {
        status: 'question',
        currentQuestionIndex: 0,
        questionStartTime: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `games/${gameId}`);
    }
  };

  const nextQuestion = async () => {
    const nextIdx = gameState.currentQuestionIndex + 1;
    if (nextIdx >= questions.length) {
      // End of current batch
      await updateDoc(doc(db, 'games', gameId!), { status: 'ended' });
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
    } else {
      await updateDoc(doc(db, 'games', gameId!), {
        status: 'question',
        currentQuestionIndex: nextIdx,
        questionStartTime: new Date().toISOString()
      });
    }
  };

  if (!gameId || !gameState) return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">Carregando...</div>;

  const currentQ = questions[gameState.currentQuestionIndex];

  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans flex flex-col">
      {/* Header */}
      <header className="bg-neutral-950 px-6 py-4 border-b border-neutral-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <BrainCircuit className="w-8 h-8 text-indigo-500" />
          <h1 className="text-xl font-bold">Host do Jogo</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-neutral-800 rounded-full transition-colors"
            title="Configurações"
          >
            <Settings className="w-6 h-6 text-neutral-400 hover:text-white" />
          </button>
          <div className="bg-neutral-800 px-6 py-2 rounded-xl border border-neutral-700 text-center">
            <p className="text-xs text-neutral-400 uppercase tracking-wider font-bold">PIN do Jogo</p>
            <p className="text-3xl font-black tracking-widest text-white">{gameId}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col max-w-7xl mx-auto w-full">
        
        {/* LOBBY & GENERATING */}
        {(gameState.status === 'lobby' || gameState.status === 'generating' || gameState.status === 'ended') && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
            
            {/* Left: Setup */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Settings className="w-6 h-6 text-indigo-400" />
                  Configurar Questões
                </h2>
                
                <div className="space-y-4">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors",
                      isDragging ? "border-indigo-500 bg-indigo-500/10" : "border-neutral-600 hover:bg-neutral-700"
                    )}
                  >
                    <Upload className={cn("w-10 h-10 mx-auto mb-3", isDragging ? "text-indigo-400" : "text-neutral-400")} />
                    <p className="font-medium">Arraste e solte seus PDFs/Textos aqui</p>
                    <p className="text-sm text-neutral-500 mt-1">ou clique para selecionar</p>
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                  </div>
                  
                  {files.length > 0 && (
                    <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-neutral-400 mb-3 uppercase tracking-wider">Arquivos Adicionados ({files.length})</h3>
                      <div className="flex flex-col gap-2">
                        {files.map((f, i) => (
                          <div key={i} className="bg-neutral-800 px-4 py-3 rounded-lg text-sm flex items-center justify-between border border-neutral-700">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                              <span className="truncate font-medium">{f.name}</span>
                            </div>
                            <button 
                              onClick={() => setFiles(f => f.filter((_, idx) => idx !== i))}
                              className="p-2 hover:bg-neutral-700 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-5 h-5 text-red-400" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Instruções Especiais (Opcional)</label>
                    <textarea 
                      value={caveats}
                      onChange={e => setCaveats(e.target.value)}
                      placeholder="Ex: Focar mais no capítulo 2, fazer perguntas difíceis..."
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-4">
                    <select 
                      value={numQuestions}
                      onChange={e => setNumQuestions(Number(e.target.value))}
                      className="bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-white outline-none"
                    >
                      <option value={4}>4 Questões</option>
                      <option value={8}>8 Questões</option>
                      <option value={12}>12 Questões</option>
                    </select>

                    <button
                      onClick={generateQuestions}
                      disabled={loading || files.length === 0}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {loading ? <><RefreshCw className="w-5 h-5 animate-spin" /> Gerando...</> : <><BrainCircuit className="w-5 h-5" /> Gerar Questões com IA</>}
                    </button>
                  </div>
                  {error && <p className="text-red-400 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
                </div>
              </div>

              {gameState.status === 'ended' && (
                <div className="bg-indigo-900/50 border border-indigo-500/50 p-6 rounded-3xl text-center">
                  <h3 className="text-2xl font-bold mb-2">Fim da Rodada!</h3>
                  <p className="text-indigo-200 mb-4">Você pode gerar mais questões acima para continuar o jogo sem perder os jogadores ou o placar.</p>
                </div>
              )}

              {questions.length > 0 && (
                <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <FileText className="w-6 h-6 text-indigo-400" />
                    Preview das Questões ({questions.length})
                  </h2>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {questions.map((q, i) => (
                      <div key={q.id} className="bg-neutral-900 p-4 rounded-xl border border-neutral-700">
                        <p className="font-bold text-lg mb-3">{i + 1}. {q.question}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.choices.map((choice: string, idx: number) => (
                            <div key={idx} className={cn(
                              "px-3 py-2 rounded-lg text-sm font-medium",
                              idx === q.correctAnswerIndex 
                                ? "bg-green-500/20 border border-green-500/50 text-green-300" 
                                : "bg-neutral-800 border border-neutral-700 text-neutral-400"
                            )}>
                              {choice}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Players & Start */}
            <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Users className="w-6 h-6 text-green-400" />
                  Jogadores ({players.length})
                </h2>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2 mb-6">
                {players.length === 0 ? (
                  <p className="text-neutral-500 text-center mt-10">Aguardando jogadores...</p>
                ) : (
                  players.map(p => (
                    <div key={p.id} className="bg-neutral-700 px-4 py-3 rounded-xl font-bold flex justify-between">
                      <span>{p.name}</span>
                      <span className="text-neutral-400">{p.score} pts</span>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={startGame}
                disabled={questions.length === 0 || players.length === 0 || gameState.status === 'generating'}
                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-neutral-700 text-white font-black text-xl py-5 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Play className="w-8 h-8" />
                INICIAR JOGO
              </button>
              {questions.length === 0 && <p className="text-center text-sm text-neutral-500 mt-2">Gere questões primeiro.</p>}
            </div>
          </div>
        )}

        {/* QUESTION VIEW */}
        {gameState.status === 'question' && currentQ && (
          <div className="flex-1 flex flex-col">
            <div className="text-center mb-8">
              <span className="bg-neutral-800 px-4 py-1 rounded-full text-sm font-bold text-neutral-400 mb-4 inline-block">
                Questão {gameState.currentQuestionIndex + 1} de {questions.length}
              </span>
              <h2 className="text-4xl md:text-5xl font-black leading-tight">{currentQ.question}</h2>
            </div>

            <div className="flex-1 flex items-center justify-center mb-8">
              <div className="w-32 h-32 rounded-full border-8 border-neutral-800 flex items-center justify-center relative">
                <span className="text-5xl font-black text-indigo-400">{timeLeft}</span>
                <div className="absolute -bottom-10 whitespace-nowrap text-neutral-500 font-bold">
                  {players.filter(p => p.currentAnswer !== null && p.currentAnswer !== -1).length} / {players.length} Respostas
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-auto">
              {currentQ.choices.map((choice: string, idx: number) => {
                const colors = ['bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500'];
                return (
                  <div key={idx} className={cn(colors[idx], "p-6 rounded-2xl shadow-lg flex items-center")}>
                    <span className="text-2xl font-bold">{choice}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* LEADERBOARD VIEW */}
        {gameState.status === 'leaderboard' && currentQ && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <h2 className="text-4xl font-black mb-8 flex items-center gap-4">
              <Trophy className="w-12 h-12 text-yellow-400" />
              Ranking Atual
            </h2>
            
            <div className="w-full max-w-2xl space-y-4 mb-12">
              {players.slice(0, 5).map((p, i) => (
                <div key={p.id} className="bg-neutral-800 p-6 rounded-2xl flex items-center justify-between border border-neutral-700">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-black text-neutral-500 w-8">{i + 1}</span>
                    <span className="text-2xl font-bold">{p.name}</span>
                  </div>
                  <span className="text-2xl font-black text-indigo-400">{p.score} pts</span>
                </div>
              ))}
            </div>

            <button
              onClick={nextQuestion}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xl px-12 py-5 rounded-full transition-all flex items-center gap-2"
            >
              Próxima Questão <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        )}

      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-3xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-6 h-6 text-indigo-400" />
                Configurações
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-neutral-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">
                  Sua Chave da API do Gemini (Opcional)
                </label>
                <input 
                  type="password"
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
                />
                <p className="text-xs text-neutral-500 mt-2">
                  Se preenchido, usará esta chave ao invés da chave padrão do sistema. Ideal para quando você exportar o projeto para o GitHub. A chave fica salva apenas no seu navegador (localStorage).
                </p>
              </div>
              
              <button
                onClick={() => {
                  localStorage.setItem('custom_gemini_key', customApiKey);
                  setShowSettings(false);
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors mt-4"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
