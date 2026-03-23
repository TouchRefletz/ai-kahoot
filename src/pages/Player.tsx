import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, setDoc, onSnapshot, updateDoc, collection, query, orderBy, getDoc } from 'firebase/firestore';
import { db, auth, signInAnon } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { BrainCircuit, CheckCircle2, XCircle, Play, Trophy } from 'lucide-react';
import { cn } from '../lib/utils';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';

export default function Player() {
  const { gameId: urlGameId } = useParams();
  const navigate = useNavigate();
  
  const [gameId, setGameId] = useState(urlGameId || '');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  
  const [gameState, setGameState] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [playerState, setPlayerState] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!joined || !gameId || !playerId) return;

    const unsubGame = onSnapshot(doc(db, 'games', gameId), (doc) => {
      if (doc.exists()) setGameState(doc.data());
    }, (err) => handleFirestoreError(err, OperationType.GET, `games/${gameId}`));

    const unsubQuestions = onSnapshot(query(collection(db, `games/${gameId}/questions`), orderBy('index')), (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `games/${gameId}/questions`));

    const unsubPlayer = onSnapshot(doc(db, `games/${gameId}/players`, playerId), (doc) => {
      if (doc.exists()) setPlayerState(doc.data());
    }, (err) => handleFirestoreError(err, OperationType.GET, `games/${gameId}/players/${playerId}`));

    const unsubPlayers = onSnapshot(collection(db, `games/${gameId}/players`), (snap) => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => b.score - a.score));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `games/${gameId}/players`));

    return () => {
      unsubGame();
      unsubQuestions();
      unsubPlayer();
      unsubPlayers();
    };
  }, [joined, gameId, playerId]);

  // Reset selected answer when a new question starts
  useEffect(() => {
    if (gameState?.status === 'question') {
      setSelectedAnswer(null);
    }
  }, [gameState?.currentQuestionIndex, gameState?.status]);

  // Check answer when leaderboard starts
  useEffect(() => {
    if (gameState?.status === 'leaderboard' && playerState?.lastAnswerCorrect) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  }, [gameState?.status, playerState?.lastAnswerCorrect]);

  // Timer logic for player
  useEffect(() => {
    if (gameState?.status === 'question' && gameState?.isReading) {
      const limit = 5;
      setTimeLeft(limit);

      const interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev === null) return limit - 1;
          const next = prev - 1;
          return next > 0 ? next : 0;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else if (gameState?.status === 'question' && !gameState?.isReading) {
      const limit = questions[gameState.currentQuestionIndex]?.timeLimit || 20;
      setTimeLeft(limit);

      const interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev === null) return limit - 1;
          const next = prev - 1;
          return next > 0 ? next : 0;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [gameState?.status, gameState?.isReading, gameState?.currentQuestionIndex, questions]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      await signInAnon();
      if (!auth.currentUser) return;
    }

    if (!gameId.trim() || !name.trim()) return;

    try {
      // Check if game exists
      const gameDoc = await getDoc(doc(db, 'games', gameId.toUpperCase()));
      if (!gameDoc.exists()) {
        alert('Jogo não encontrado!');
        return;
      }

      const uid = auth.currentUser.uid;
      setPlayerId(uid);
      
      await setDoc(doc(db, `games/${gameId.toUpperCase()}/players`, uid), {
        uid,
        name: name.trim(),
        score: 0,
        currentAnswer: null,
        lastAnswerCorrect: null,
        joinedAt: new Date().toISOString()
      });

      setGameId(gameId.toUpperCase());
      setJoined(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `games/${gameId}/players`);
    }
  };

  const submitAnswer = async (index: number) => {
    if (selectedAnswer !== null || gameState?.status !== 'question') return;
    setSelectedAnswer(index);
    
    const limit = questions[gameState.currentQuestionIndex]?.timeLimit || 20;
    const timeTaken = limit - (timeLeft ?? limit);

    try {
      await updateDoc(doc(db, `games/${gameId}/players`, playerId!), {
        currentAnswer: index,
        answeredAt: new Date().toISOString(),
        timeTaken: timeTaken
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4 font-sans text-white">
        <div className="max-w-md w-full bg-neutral-800 p-8 rounded-3xl shadow-2xl border border-neutral-700">
          <div className="text-center mb-8">
            <BrainCircuit className="w-16 h-16 text-indigo-500 mx-auto mb-4" />
            <h1 className="text-3xl font-extrabold tracking-tight">Entrar no Jogo</h1>
          </div>
          
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              placeholder="PIN do Jogo"
              value={gameId}
              onChange={(e) => setGameId(e.target.value.toUpperCase())}
              className="w-full text-center text-2xl font-bold tracking-widest bg-neutral-900 border-2 border-neutral-700 rounded-xl py-4 focus:outline-none focus:border-indigo-500 transition-colors uppercase"
              required
            />
            <input
              type="text"
              placeholder="Seu Apelido"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-center text-xl font-bold bg-neutral-900 border-2 border-neutral-700 rounded-xl py-4 focus:outline-none focus:border-indigo-500 transition-colors"
              required
              maxLength={15}
            />
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-6 h-6" />
              Entrar no Jogo
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">Carregando...</div>;

  const status = gameState.status;

  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans flex flex-col">
      <header className="bg-neutral-950 px-6 py-4 border-b border-neutral-800 flex justify-between items-center">
        <div className="font-bold text-lg">{name}</div>
        <div className="bg-neutral-800 px-4 py-1 rounded-full font-mono font-bold text-indigo-400">
          {playerState?.score || 0} pts
        </div>
      </header>

      <main className="flex-1 flex flex-col p-4">
        
        {(status === 'lobby' || status === 'generating' || status === 'ended') && (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center animate-pulse mb-4">
              <span className="text-4xl font-black text-neutral-600">?</span>
            </div>
            <h2 className="text-3xl font-black">
              {status === 'generating' ? 'O professor está gerando questões com IA...' : 
               status === 'ended' ? 'Fim da rodada! Aguarde o professor...' : 
               'Você está no jogo!'}
            </h2>
            <p className="text-neutral-400 text-xl">Olhe para a tela principal.</p>
          </div>
        )}

        {status === 'question' && gameState?.isReading && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <h2 className="text-3xl font-black mb-8 mt-4">Leia a questão na tela principal!</h2>
            <div className="relative w-40 h-40 mx-auto flex items-center justify-center mb-10">
              <div className="absolute inset-0 rounded-full border-8 border-indigo-500/30"></div>
              <div className="absolute inset-0 rounded-full border-8 border-indigo-500 border-t-transparent animate-spin"></div>
              <span className="text-6xl font-black text-white">{timeLeft}</span>
            </div>
            <p className="text-2xl text-neutral-400 font-bold animate-pulse">Preparando alternativas...</p>
          </div>
        )}

        {status === 'question' && !gameState?.isReading && (
          <div className="flex-1 flex flex-col">
            {selectedAnswer !== null ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center mb-6">
                  <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <h2 className="text-3xl font-black">Aguardando os outros...</h2>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {questions[gameState.currentQuestionIndex] && (
                  <div className="text-center mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <span className="bg-neutral-800 px-3 py-1 rounded-full text-sm font-bold text-neutral-400">
                        Questão {gameState.currentQuestionIndex + 1}
                      </span>
                      {timeLeft !== null && (
                        <span className="bg-indigo-900/50 text-indigo-400 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                          {timeLeft}s
                        </span>
                      )}
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black leading-tight">
                      {questions[gameState.currentQuestionIndex].question}
                    </h2>
                  </div>
                )}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {questions[gameState.currentQuestionIndex]?.choices.map((choice: string, idx: number) => {
                    const colors = ['bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500'];
                    return (
                      <button
                        key={idx}
                        onClick={() => submitAnswer(idx)}
                        className={cn(colors[idx], "p-4 rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center justify-center text-center")}
                      >
                        <span className="text-xl md:text-2xl font-bold">{choice}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {status === 'answer_reveal' && (
          <div className="flex-1 flex flex-col">
            <div className="text-center mb-6">
              <h2 className="text-2xl md:text-3xl font-black leading-tight">
                {questions[gameState.currentQuestionIndex]?.question}
              </h2>
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              {questions[gameState.currentQuestionIndex]?.choices.map((choice: string, idx: number) => {
                const isCorrect = idx === questions[gameState.currentQuestionIndex].correctAnswerIndex;
                const isSelected = idx === playerState?.currentAnswer;
                const colors = ['bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500'];
                const explanation = questions[gameState.currentQuestionIndex]?.explanations?.[idx];
                
                return (
                  <div
                    key={idx}
                    className={cn(
                      colors[idx], 
                      "p-4 rounded-2xl shadow-lg flex flex-col justify-center text-center transition-all duration-500 relative",
                      isCorrect ? "scale-105 ring-4 ring-white z-10" : "opacity-50 grayscale"
                    )}
                  >
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <span className="text-xl md:text-2xl font-bold">{choice}</span>
                      {isCorrect ? <CheckCircle2 className="w-6 h-6 text-white" /> : <XCircle className="w-6 h-6 text-white/50" />}
                    </div>
                    {explanation && (
                      <p className="text-white/90 text-sm font-medium mt-2 bg-black/20 p-2 rounded-lg">
                        {explanation}
                      </p>
                    )}
                    {isSelected && (
                      <div className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-black font-black text-sm">Tu</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 text-center">
              {playerState?.lastAnswerCorrect ? (
                <div className="bg-green-600 text-white p-4 rounded-xl font-bold text-xl animate-bounce">
                  +{playerState?.lastScoreAdded || 0} pontos!
                </div>
              ) : (
                <div className="bg-red-600 text-white p-4 rounded-xl font-bold text-xl">
                  Errou!
                </div>
              )}
            </div>
          </div>
        )}

        {status === 'leaderboard' && (
          <div className={cn(
            "flex-1 flex flex-col items-center justify-center text-center transition-colors duration-500",
            playerState?.lastAnswerCorrect ? "bg-green-600" : "bg-red-600"
          )}>
            {playerState?.lastAnswerCorrect ? (
              <>
                <CheckCircle2 className="w-32 h-32 text-white mb-6" />
                <h2 className="text-5xl font-black mb-2">Correto!</h2>
                <p className="text-2xl font-bold opacity-80">+{playerState?.lastScoreAdded || 0} pts</p>
              </>
            ) : (
              <>
                <XCircle className="w-32 h-32 text-white mb-6" />
                <h2 className="text-5xl font-black mb-2">Incorreto!</h2>
                <p className="text-2xl font-bold opacity-80">Mais sorte na próxima</p>
              </>
            )}
          </div>
        )}

        {status === 'podium' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Trophy className="w-32 h-32 text-yellow-400 mb-6 animate-in zoom-in duration-700" />
            <h2 className="text-4xl font-black mb-4">Fim de Jogo!</h2>
            
            {players.findIndex(p => p.id === playerId) === 0 ? (
              <div className="bg-yellow-400/20 border-2 border-yellow-400 text-yellow-400 p-6 rounded-3xl animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
                <p className="text-2xl font-bold mb-2">Você Venceu! 🥇</p>
                <p className="text-4xl font-black">{playerState?.score || 0} pts</p>
              </div>
            ) : players.findIndex(p => p.id === playerId) === 1 ? (
              <div className="bg-neutral-300/20 border-2 border-neutral-300 text-neutral-300 p-6 rounded-3xl animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
                <p className="text-2xl font-bold mb-2">2º Lugar! 🥈</p>
                <p className="text-4xl font-black">{playerState?.score || 0} pts</p>
              </div>
            ) : players.findIndex(p => p.id === playerId) === 2 ? (
              <div className="bg-amber-600/20 border-2 border-amber-600 text-amber-500 p-6 rounded-3xl animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
                <p className="text-2xl font-bold mb-2">3º Lugar! 🥉</p>
                <p className="text-4xl font-black">{playerState?.score || 0} pts</p>
              </div>
            ) : (
              <div className="bg-indigo-600/20 border-2 border-indigo-500 text-indigo-300 p-6 rounded-3xl animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
                <p className="text-xl font-bold mb-2">Sua Posição:</p>
                <p className="text-5xl font-black mb-2">#{players.findIndex(p => p.id === playerId) + 1}</p>
                <p className="text-2xl font-bold">{playerState?.score || 0} pts</p>
              </div>
            )}
            
            <p className="text-neutral-400 mt-12 animate-in fade-in duration-1000 delay-1000 fill-mode-both">Olhe para a tela principal para ver o pódio completo.</p>
          </div>
        )}

      </main>
    </div>
  );
}
