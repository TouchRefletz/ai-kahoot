import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrainCircuit, Play, Users, LogIn } from 'lucide-react';
import { auth, signInWithGoogle } from '../firebase';

export default function Home() {
  const navigate = useNavigate();
  const [gamePin, setGamePin] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (gamePin.trim()) {
      navigate(`/play/${gamePin.trim()}`);
    }
  };

  const handleHost = async () => {
    if (!auth.currentUser) {
      await signInWithGoogle();
    }
    if (auth.currentUser) {
      navigate('/host');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-4 font-sans text-white">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <BrainCircuit className="w-20 h-20 text-indigo-500 mx-auto mb-6" />
          <h1 className="text-4xl font-extrabold tracking-tight mb-2">AI Kahoot Clone</h1>
          <p className="text-neutral-400">Gere questões com IA e jogue em tempo real.</p>
        </div>

        <div className="bg-neutral-800 p-8 rounded-3xl shadow-2xl border border-neutral-700 space-y-6">
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="PIN do Jogo"
                value={gamePin}
                onChange={(e) => setGamePin(e.target.value.toUpperCase())}
                className="w-full text-center text-2xl font-bold tracking-widest bg-neutral-900 border-2 border-neutral-700 rounded-xl py-4 focus:outline-none focus:border-indigo-500 transition-colors uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={!gamePin.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-6 h-6" />
              Entrar no Jogo
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-neutral-800 text-neutral-500">OU</span>
            </div>
          </div>

          <button
            onClick={handleHost}
            className="w-full bg-neutral-700 hover:bg-neutral-600 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {auth.currentUser ? (
              <>
                <Users className="w-6 h-6" />
                Criar Novo Jogo (Host)
              </>
            ) : (
              <>
                <LogIn className="w-6 h-6" />
                Login para Criar Jogo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
