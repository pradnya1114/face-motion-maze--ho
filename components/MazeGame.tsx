'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Timer, User, Home, RotateCcw, Play, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Download, Medal } from 'lucide-react';
import { generateMaze, findSE, Cell } from '@/lib/maze';
import { FaceTracker } from './FaceTracker';
import confetti from 'canvas-confetti';

type GameState = 'menu' | 'playing' | 'result';

interface Score {
  name: string;
  time: number;
  date: string;
}

const MAZE_WIDTH = 21;
const MAZE_HEIGHT = 15;
const MOVEMENT_DELAY = 100; // ms
const TILT_THRESHOLD = 4;
const PITCH_THRESHOLD = 3;

const MazeCell = React.memo(({ r, c, cell, isPlayer, isGoal }: { r: number, c: number, cell: string, isPlayer: boolean, isGoal: boolean }) => {
  return (
    <div
      className={`
        relative
        ${cell === '#' ? 'bg-white/10' : 'bg-transparent'}
        ${isGoal ? 'bg-blue-500/20' : ''}
      `}
    >
      {isPlayer && (
        <motion.div
          layoutId="player"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          className="absolute inset-[10%] bg-blue-500 rounded-sm shadow-[0_0_15px_rgba(59,130,246,0.6)] z-20"
        />
      )}
      {isGoal && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
        </div>
      )}
    </div>
  );
});

MazeCell.displayName = 'MazeCell';

export const MazeGame = () => {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [playerName, setPlayerName] = useState('');
  const [maze, setMaze] = useState<Cell[][]>([]);
  const [playerPos, setPlayerPos] = useState<[number, number]>([1, 1]);
  const [goalPos, setGoalPos] = useState<[number, number]>([MAZE_HEIGHT - 2, MAZE_WIDTH - 2]);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [leaderboard, setLeaderboard] = useState<Score[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setIsMounted(true);
      const saved = localStorage.getItem('maze_leaderboard');
      if (saved) {
        setLeaderboard(JSON.parse(saved));
      }
    }, 0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Clear leaderboard on 'C' key press
      if (e.key.toLowerCase() === '2') {
        localStorage.removeItem('maze_leaderboard');
        setLeaderboard([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const [lastMoveTime, setLastMoveTime] = useState(0);

  const saveScore = useCallback((name: string, time: number) => {
    const newScore: Score = {
      name,
      time,
      date: new Date().toLocaleDateString(),
    };
    const updated = [...leaderboard, newScore]
      .sort((a, b) => a.time - b.time);
    setLeaderboard(updated);
    localStorage.setItem('maze_leaderboard', JSON.stringify(updated));
  }, [leaderboard]);

  const startGame = () => {
    if (!playerName.trim()) return;
    const newMaze = generateMaze(MAZE_HEIGHT, MAZE_WIDTH);
    const { start, end } = findSE(newMaze);
    setMaze(newMaze);
    setPlayerPos(start);
    setGoalPos(end);
    setStartTime(Date.now());
    setElapsedTime(0);
    setGameState('playing');
  };

  const handleMotion = useCallback(({ roll, pitch }: { roll: number; pitch: number }) => {
    if (gameState !== 'playing') return;
    
    const now = Date.now();
    if (now - lastMoveTime < MOVEMENT_DELAY) return;

    let [r, c] = playerPos;
    let moved = false;

    // Left/Right (Roll)
    if (roll > TILT_THRESHOLD && maze[r][c + 1] !== '#') {
      c++;
      moved = true;
    } else if (roll < -TILT_THRESHOLD && maze[r][c - 1] !== '#') {
      c--;
      moved = true;
    }
    
    // Up/Down (Pitch) - Check independently if not moved horizontally
    if (!moved) {
      if (pitch < -PITCH_THRESHOLD && maze[r - 1][c] !== '#') {
        r--;
        moved = true;
      } else if (pitch > PITCH_THRESHOLD && maze[r + 1][c] !== '#') {
        r++;
        moved = true;
      }
    }

    if (moved) {
      setPlayerPos([r, c]);
      setLastMoveTime(now);

      if (r === goalPos[0] && c === goalPos[1]) {
        const finalTime = Math.floor((Date.now() - startTime) / 1000);
        setElapsedTime(finalTime);
        saveScore(playerName, finalTime);
        setGameState('result');
        
        // Fire confetti from both bottom corners
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function() {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          // fire from bottom corners
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: randomInRange(0.7, 0.9) } });
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: randomInRange(0.7, 0.9) } });
        }, 250);
      }
    }
  }, [gameState, playerPos, maze, goalPos, lastMoveTime, startTime, playerName, saveScore]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState === 'playing') {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState, startTime]);

  const downloadCSV = useCallback(() => {
    const headers = ['Rank', 'Pilot Name', 'Time (seconds)', 'Date'];
    const rows = leaderboard.map((score, index) => [
      index + 1,
      score.name,
      score.time,
      score.date
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `maze_leaderboard_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [leaderboard]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'result' && e.key === '1') {
        downloadCSV();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, downloadCSV]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen text-white font-sans selection:bg-blue-500/30 overflow-hidden relative">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <img 
          src="/bg.png" 
          className="absolute inset-0 w-full h-full object-cover" 
          alt="Background"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop";
          }}
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-black/20" /> {/* Subtle overlay to keep text readable */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-400/5 blur-[120px] rounded-full" />
      </div>

      {/* Persistent Camera HUD - Positioned below time in game */}
      {isMounted && (
        <div 
          className={`
            fixed z-[100] shadow-2xl border-2 border-blue-500/20 rounded-2xl overflow-hidden transition-all duration-500
            ${gameState === 'playing' 
              ? 'top-28 right-6 w-64 md:w-72 aspect-video opacity-100 scale-100' 
              : 'top-6 right-6 w-64 md:w-72 aspect-video opacity-0 scale-95 pointer-events-none'}
          `}
        >
          <FaceTracker onMotion={handleMotion} isActive={gameState === 'playing'} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {gameState === 'menu' && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6"
          >
            <div className="max-w-md w-full space-y-12 text-center">
              <div className="space-y-4">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="inline-block px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px] font-mono uppercase tracking-[0.2em] mb-4"
                >
                   Motion Control
                </motion.div>
                <h1 className="text-7xl font-black tracking-tighter uppercase leading-[0.85] italic">
                  Face<br />Motion<br /><span className="text-blue-500">Maze</span>
                </h1>
                <p className="text-white/40 font-mono text-xs uppercase tracking-widest mt-6">
                  Navigate the labyrinth using your head movements
                </p>
              </div>

              <div className="space-y-6">
                <div className="relative group">
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="ENTER PILOT NAME"
                    className="w-full bg-white/5 border-b-2 border-white/10 px-4 py-4 text-center text-xl font-mono focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-white/10 uppercase"
                    maxLength={15}
                  />
                  <div className="absolute bottom-0 left-0 w-0 h-[2px] bg-emerald-500 group-focus-within:w-full transition-all duration-500" />
                </div>

                <button
                  onClick={startGame}
                  disabled={!playerName.trim()}
                  className="w-full group relative overflow-hidden bg-white text-black py-5 rounded-xl font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Initialize System <Play className="w-4 h-4 fill-current" />
                  </span>
                  <div className="absolute inset-0 bg-blue-500 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'playing' && (
          <motion.div
            key="playing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex flex-col h-screen"
          >
            {/* Header */}
            <div className="grid grid-cols-3 items-center p-6">
              <div className="flex items-center gap-4">
                {/* Buttons removed as requested */}
              </div>

              <div className="flex flex-col items-center">
                <p className="text-[9px] font-mono text-white/80 uppercase tracking-widest">Active Pilot</p>
                <p className="text-xl font-black uppercase italic text-blue-500">{playerName}</p>
              </div>
              
              <div className="flex justify-end items-center gap-8">
                <div className="text-right">
                  <p className="text-[9px] font-mono text-white/80 uppercase tracking-widest">Mission Time</p>
                  <p className="text-2xl font-mono font-black text-white tabular-nums">{formatTime(elapsedTime)}</p>
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative flex items-center justify-start pl-32 pr-80 p-4 overflow-hidden">
              {/* Maze Grid */}
              <div className="relative p-3 bg-white/5 rounded-2xl border border-white/50 backdrop-blur-sm shadow-2xl max-h-full max-w-full overflow-auto">
                <div 
                  className="grid gap-px bg-white/5"
                  style={{ 
                    gridTemplateColumns: `repeat(${MAZE_WIDTH}, minmax(0, 1fr))`,
                    width: 'min(90vw, 800px)',
                    aspectRatio: `${MAZE_WIDTH} / ${MAZE_HEIGHT}`
                  }}
                >
                  {maze.map((row, r) => 
                    row.map((cell, c) => (
                      <MazeCell
                        key={`${r}-${c}`}
                        r={r}
                        c={c}
                        cell={cell}
                        isPlayer={playerPos[0] === r && playerPos[1] === c}
                        isGoal={goalPos[0] === r && goalPos[1] === c}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'result' && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6"
          >
            <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Side: Winner Info Box */}
              <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-3xl shadow-2xl flex flex-col justify-between">
                <div className="space-y-6">
                  <div className="text-center lg:text-left space-y-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-500/20 border border-blue-500/30 mb-2 rotate-3">
                      <Trophy className="w-10 h-10 text-blue-500" />
                    </div>
                    <h2 className="text-3xl md:text-5xl lg:text-5xl font-black uppercase italic tracking-tighter leading-none whitespace-nowrap">Congratulations</h2>
                    <p className="text-blue-500 font-mono text-4xl md:text-6xl uppercase tracking-tighter font-black italic">{playerName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-12 pb-8 border-y border-white/10">
                    <div className="text-center lg:text-left p-4 bg-white/5 rounded-xl border border-white/5">
                      <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-2">Time</p>
                      <p className="text-4xl font-mono font-black text-blue-500 tabular-nums">{formatTime(elapsedTime)}</p>
                    </div>
                    <div className="text-center lg:text-left p-4 bg-white/5 rounded-xl border border-white/5">
                      <p className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-2">Rank</p>
                      <div className="flex items-center justify-center lg:justify-start gap-2">
                        {(() => {
                          const rank = leaderboard.findIndex(s => s.time === elapsedTime && s.name === playerName);
                          if (rank === 0) return (
                            <>
                              <Medal className="w-8 h-8 text-yellow-400" />
                              <span className="text-4xl font-mono font-black tabular-nums">#1</span>
                            </>
                          );
                          if (rank === 1) return (
                            <>
                              <Medal className="w-8 h-8 text-slate-300" />
                              <span className="text-4xl font-mono font-black tabular-nums">#2</span>
                            </>
                          );
                          if (rank === 2) return (
                            <>
                              <Medal className="w-8 h-8 text-amber-600" />
                              <span className="text-4xl font-mono font-black tabular-nums">#3</span>
                            </>
                          );
                          return <span className="text-4xl font-mono font-black tabular-nums">#{rank + 1 || '--'}</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-8">
                  <button
                    onClick={() => setGameState('menu')}
                    className="flex-1 px-6 py-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold uppercase tracking-widest flex items-center justify-center gap-2 text-xs"
                  >
                    <Home className="w-4 h-4" /> Menu
                  </button>
                  <button
                    onClick={startGame}
                    className="flex-1 px-6 py-4 rounded-xl bg-white text-black hover:bg-blue-500 hover:text-white transition-all font-black uppercase tracking-widest flex items-center justify-center gap-2 text-xs"
                  >
                    <RotateCcw className="w-4 h-4" /> Retry
                  </button>
                </div>
              </div>

              {/* Right Side: Leaderboard Box */}
              <div className="bg-white/5 border border-white/20 rounded-[2.5rem] p-8 backdrop-blur-3xl shadow-2xl flex flex-col relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/40 border border-white/20 z-20">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div className="flex items-center justify-between mb-6 mt-5">
                  <p className="text-[20px] font-mono text-white/80 uppercase tracking-[0.4em]">Leaderboard</p>
                  <div className="w-12 h-[1px] bg-white/40" />
                </div>
                
                <div className="flex items-center justify-between mb-4 px-5">
                  <div className="flex items-center gap-4">
                    <span className="text-[9px] font-mono text-white/80 w-5">RANK</span>
                    <span className="text-[9px] font-mono text-white/80 uppercase tracking-widest">Pilot Name</span>
                  </div>
                  <span className="text-[9px] font-mono text-white/80 uppercase tracking-widest">Time</span>
                </div>
                
                <div className="flex-1 space-y-2">
                  {leaderboard.slice(0, 10).map((score, i) => (
                    <div 
                      key={i} 
                      className={`
                        flex items-center justify-between px-5 py-3 rounded-xl border transition-all
                        ${score.time === elapsedTime && score.name === playerName 
                          ? 'bg-blue-500/20 border-blue-500/40 scale-[1.02] shadow-lg shadow-blue-500/10' 
                          : 'bg-white/5 border-white/5 hover:bg-white/10'}
                      `}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-6">
                          {i === 0 && <Medal className="w-4 h-4 text-yellow-400" />}
                          {i === 1 && <Medal className="w-4 h-4 text-slate-300" />}
                          {i === 2 && <Medal className="w-4 h-4 text-amber-600" />}
                          {i > 2 && (
                            <span className="text-[10px] font-mono text-white/20">
                              {i + 1 < 10 ? `0${i + 1}` : i + 1}
                            </span>
                          )}
                        </div>
                        <span className="font-bold uppercase tracking-widest text-sm truncate max-w-[120px]">{score.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-blue-400 font-black text-base">{formatTime(score.time)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};