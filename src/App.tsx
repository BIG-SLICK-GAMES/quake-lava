import { useEffect, useRef, useState } from "react";
import {
  Game,
  Screen,
  Settings,
  formatScore,
  initialGame,
  selectSlot,
  tick,
  total,
  triggerQuake,
} from "./game";
const load = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
};
const defaults: Settings = {
  sound: true,
  music: true,
  haptics: true,
  reducedMotion: false,
  musicVolume: 80,
  sfxVolume: 80,
  language: "English",
};
const tileImage = (label: string) => `url('/assets/tiles/${label}.jpg')`;
const holdingTileImage = (label: string) => `url('/assets/holding-tiles/${label}.png')`;
const totalTileLabel = (value: number) => value >= 0 && value <= 21 ? String(value) : null;
type LeaderboardEntry = { name: string; score: number };
const leaderboardEndpoint = "/.netlify/functions/leaderboard";
const cleanLeaderboard = (entries: LeaderboardEntry[]) =>
  entries.filter((entry) => {
    const candidate = entry.name.trim().toLowerCase();
    return !entries.some((other) => {
      const fullName = other.name.trim().toLowerCase();
      return (
        other.score === entry.score &&
        fullName.length > candidate.length &&
        fullName.startsWith(candidate)
      );
    });
  });
const playerBest = (entries: LeaderboardEntry[], playerName: string) =>
  entries.find(
    (entry) => entry.name.toLowerCase() === playerName.trim().toLowerCase(),
  )?.score ?? 0;

const requestLeaderboard = async (entry?: LeaderboardEntry) => {
  const response = await fetch(leaderboardEndpoint, entry
    ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry),
      }
    : undefined);
  if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
    throw new Error("Online leaderboard is unavailable");
  }
  return (await response.json()) as LeaderboardEntry[];
};

export default function App() {
  const [quakeShaking, setQuakeShaking] = useState(false);
  const [quitConfirm, setQuitConfirm] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const previousQuake = useRef(0);
  const heartbeatAudio = useRef<HTMLAudioElement | null>(null);
  const [screen, setScreen] = useState<Screen>(() =>
    load("quake.player", "") ? "lobby" : "login",
  );
  const [name, setName] = useState(() => load("quake.player", ""));
  const [settings, setSettings] = useState(() => ({
    ...defaults,
    ...load("quake.settings", defaults),
  }));
  const [settingsNotice, setSettingsNotice] = useState("");
  const [game, setGame] = useState<Game>(() => {
    const savedName = load("quake.player", "");
    return initialGame(
      playerBest(load<LeaderboardEntry[]>("quake.leaderboard", []), savedName),
    );
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() =>
    cleanLeaderboard(load("quake.leaderboard", [])),
  );
  const gameRef = useRef(game);
  gameRef.current = game;
  const previous = useRef(performance.now());
  const unlockHeartbeatAudio = () => {
    const audio = heartbeatAudio.current ?? new Audio("/assets/audio/heartbeat.wav");
    heartbeatAudio.current = audio;
    audio.volume = Math.min(1, Math.max(0, settings.sfxVolume / 100));
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  };
  useEffect(() => {
    localStorage.setItem("quake.settings", JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    localStorage.setItem("quake.leaderboard", JSON.stringify(leaderboard));
  }, [leaderboard]);
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const rankings = await requestLeaderboard();
        if (!cancelled) {
          setLeaderboard(rankings);
          localStorage.setItem("quake.leaderboard", JSON.stringify(rankings));
        }
      } catch {
        // Docker/offline builds continue using the local leaderboard.
      }
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (screen === "login" || !name.trim()) return;
    setLeaderboard((entries) => {
      const playerName = name.trim();
      const existing = entries.find(
        (entry) => entry.name.toLowerCase() === playerName.toLowerCase(),
      );
      const next = existing
        ? entries.map((entry) =>
            entry === existing
              ? { ...entry, score: Math.max(entry.score, game.bestScore) }
              : entry,
          )
        : [...entries, { name: playerName, score: game.bestScore }];
      const sorted = next.sort((a, b) => b.score - a.score);
      localStorage.setItem("quake.leaderboard", JSON.stringify(sorted));
      void requestLeaderboard({ name: playerName, score: game.bestScore })
        .then((rankings) => {
          setLeaderboard(rankings);
          localStorage.setItem("quake.leaderboard", JSON.stringify(rankings));
        })
        .catch(() => undefined);
      return sorted;
    });
  }, [name, game.bestScore, screen]);
  useEffect(() => {
    if (screen !== "game" || settings.sfxVolume <= 0) return;
    const audio = heartbeatAudio.current ?? new Audio("/assets/audio/heartbeat.wav");
    heartbeatAudio.current = audio;
    let timer = 0;
    let stopped = false;

    const heartbeat = () => {
      if (stopped) return;
      const current = gameRef.current;
      if (current.status !== "playing") {
        timer = window.setTimeout(heartbeat, 120);
        return;
      }
      const urgency = Math.min(1, Math.max(0, 1 - current.remaining / current.duration));
      audio.volume = Math.min(1, (settings.sfxVolume / 100) * (0.72 + urgency * 0.28));
      audio.playbackRate = 1 + urgency * 0.16;
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
      const interval = 900 - urgency * 580;
      timer = window.setTimeout(heartbeat, interval);
    };

    heartbeat();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      audio.pause();
    };
  }, [screen, settings.sfxVolume]);
  useEffect(() => {
    if (game.quake < previousQuake.current) {
      previousQuake.current = game.quake;
      return;
    }
    if (game.quake <= previousQuake.current) return;
    previousQuake.current = game.quake;
    setQuakeShaking(false);
    const start = requestAnimationFrame(() => setQuakeShaking(true));
    const stop = window.setTimeout(() => setQuakeShaking(false), 540);
    return () => {
      cancelAnimationFrame(start);
      window.clearTimeout(stop);
    };
  }, [game.quake]);
  useEffect(() => {
    if (screen !== "game") return;
    let frame = 0;
    const loop = (now: number) => {
      const d = (now - previous.current) / 1000;
      previous.current = now;
      setGame((g) => tick(g, d));
      frame = requestAnimationFrame(loop);
    };
    previous.current = performance.now();
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [screen]);
  const start = () => {
    unlockHeartbeatAudio();
    setQuitConfirm(false);
    setGame(initialGame(playerBest(leaderboard, name)));
    setScreen("game");
  };
  if (screen === "login")
    return (
      <Shell>
        <h1>21 QUAKE</h1>
        <p>STACK ’EM. HIT 21. SURVIVE.</p>
        <input
          value={name}
          maxLength={18}
          placeholder="PLAYER NAME"
          onChange={(e) => setName(e.target.value)}
        />
        <button
          onClick={() => {
            if (name.trim()) {
              const playerName = name.trim();
              localStorage.setItem("quake.player", JSON.stringify(playerName));
              setName(playerName);
              setGame(initialGame(playerBest(leaderboard, playerName)));
              setScreen("lobby");
            }
          }}
        >
          ENTER
        </button>
        <button onClick={() => setScreen("how")}>HOW TO PLAY</button>
      </Shell>
    );
  if (screen === "lobby")
    return (
      <Shell>
        <h1>21 QUAKE</h1>
        <h2>WELCOME, {name}</h2>
        <p>BEST SCORE {formatScore(game.bestScore)}</p>
        <button className="lobby-art-button lobby-art-play" onClick={start} aria-label="Play">PLAY</button>
        <button className="lobby-art-button lobby-art-how" onClick={() => setScreen("how")} aria-label="How to Play">HOW TO PLAY</button>
        <button className="lobby-art-button lobby-art-settings" onClick={() => setScreen("settings")} aria-label="Settings">SETTINGS</button>
        <button className="lobby-art-button lobby-art-leaderboards" onClick={() => setScreen("leaderboards")} aria-label="Leaderboards">LEADERBOARDS</button>
      </Shell>
    );
  if (screen === "how")
    return (
      <Shell>
        <h1>HOW TO PLAY</h1>
        <p>
          Select up to five tiles. A is 1; J, Q and K are 10. Reach exactly 21,
          then press QUAKE before the lava reaches the top. Each survived quake
          makes the timer faster.
        </p>
        <button onClick={() => setScreen(name ? "lobby" : "login")}>
          GOT IT
        </button>
      </Shell>
    );
  if (screen === "settings")
    return (
      <main className="phone settings-page">
        <div className="settings-header">
          <h1>SETTINGS</h1>
          <button aria-label="Close settings" onClick={() => setScreen("lobby")}>
            ×
          </button>
        </div>

        <section className="settings-profile-card">
          <div className="settings-avatar" aria-hidden="true"><span /></div>
          <div className="settings-identity">
            <strong
              style={{
                fontSize: `${Math.max(11, 20 - Math.max(0, name.length - 8) * 0.7)}px`,
              }}
            >
              {name}
            </strong>
            <span>21 QUAKE PLAYER</span>
          </div>
          <button
            className="settings-hub"
            onClick={() => setSettingsNotice("BSG Hub is coming soon.")}
          >
            BSG HUB
          </button>
          <div className="settings-stat"><span>● CHIPS</span><b>10,000</b></div>
          <div className="settings-stat"><span>◇ SCORE</span><b>{formatScore(game.bestScore)}</b></div>
        </section>

        <SettingsSection title="AUDIO">
          <label className="volume-row">
            <span>◖ MUSIC</span>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.musicVolume}
              style={{
                background: `linear-gradient(90deg, #d84413 0 ${settings.musicVolume}%, #110c0a ${settings.musicVolume}% 100%)`,
              }}
              onChange={(event) => {
                const musicVolume = Number(event.target.value);
                setSettings((current) => ({ ...current, musicVolume, music: musicVolume > 0 }));
              }}
            />
            <b>◗</b>
          </label>
          <label className="volume-row">
            <span>◖ SFX</span>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.sfxVolume}
              style={{
                background: `linear-gradient(90deg, #d84413 0 ${settings.sfxVolume}%, #110c0a ${settings.sfxVolume}% 100%)`,
              }}
              onChange={(event) => {
                const sfxVolume = Number(event.target.value);
                setSettings((current) => ({ ...current, sfxVolume, sound: sfxVolume > 0 }));
              }}
            />
            <b>◗</b>
          </label>
        </SettingsSection>

        <SettingsSection title="GENERAL">
          <label className="language-row">
            <span>LANGUAGE</span>
            <select
              value={settings.language}
              onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value }))}
            >
              <option>English</option>
              <option>Español</option>
              <option>Français</option>
              <option>Deutsch</option>
              <option>日本語</option>
            </select>
          </label>
        </SettingsSection>

        <SettingsSection title="ACCOUNT">
          <div className="settings-button-grid">
            <button onClick={() => setSettingsNotice("Account linking is coming soon.")}>↗ LINK ACCOUNT</button>
            <button onClick={() => setSettingsNotice(`${name}'s best score is ${formatScore(game.bestScore)}.`)}>○ PROFILE</button>
          </div>
        </SettingsSection>

        <SettingsSection title="SUPPORT">
          <div className="settings-button-grid">
            <button onClick={() => setSettingsNotice("Support center is coming soon.")}>◉ HELP &amp; SUPPORT</button>
            <button onClick={() => setScreen("how")}>ⓘ HELP</button>
          </div>
        </SettingsSection>

        <SettingsSection title="SESSION">
          <button
            className="settings-logout-wide"
            onClick={() => setLogoutConfirm(true)}
          >
            ⇥ LOG OUT
          </button>
        </SettingsSection>

        {settingsNotice && (
          <button className="settings-notice" onClick={() => setSettingsNotice("")}>
            {settingsNotice}
          </button>
        )}
        {logoutConfirm && (
          <div className="logout-confirm" role="dialog" aria-modal="true" aria-labelledby="logout-title">
            <div className="logout-confirm-card">
              <h2 id="logout-title">LOG OUT?</h2>
              <p>Are you sure you want to log out?</p>
              <div className="logout-confirm-actions">
                <button className="logout-cancel" onClick={() => setLogoutConfirm(false)}>CANCEL</button>
                <button
                  className="logout-submit"
                  onClick={() => {
                    localStorage.removeItem("quake.player");
                    setLogoutConfirm(false);
                    setName("");
                    setScreen("login");
                  }}
                >
                  LOG OUT
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  if (screen === "leaderboards")
    return (
      <main className="phone leaderboard-screen">
        <div className="leaderboard-art">
          <img src="/assets/leaderboards5.jpg" alt="21 Quake leaderboards" />
          <div className="leaderboard-champion">
            <strong>{leaderboard[0]?.name ?? "NO PLAYER"}</strong>
            <b>{formatScore(leaderboard[0]?.score ?? 0)}</b>
          </div>
          <ol className="leaderboard-list">
            {leaderboard.slice(0, 9).map((entry, index) => (
              <li key={entry.name.toLowerCase()}>
                <span>{index + 1}</span>
                <strong
                  title={entry.name}
                  style={{
                    fontSize: `${Math.max(7, 11 - Math.max(0, entry.name.length - 9) * 0.45)}px`,
                  }}
                >
                  {entry.name}
                </strong>
                <b>{formatScore(entry.score)}</b>
              </li>
            ))}
          </ol>
          <button
            className="leaderboard-close"
            aria-label="Back to lobby"
            onClick={() => setScreen("lobby")}
          />
        </div>
      </main>
    );
  if (screen === "gameover")
    return (
      <Shell>
        <h1>GAME OVER</h1>
        <p>{game.message}</p>
        <h2>SCORE {formatScore(game.score)}</h2>
        <p>QUAKES SURVIVED {game.quake - 1}</p>
        <button onClick={start}>PLAY AGAIN</button>
        <button onClick={() => setScreen("lobby")}>LOBBY</button>
      </Shell>
    );
  const progress = 1 - game.remaining / game.duration;
  return (
    <div className="game-stage">
    <main className={`phone game${quakeShaking ? " quake-shaking" : ""}`}>
      <header>
        <div className="score-readout">
          SCORE
          <br />
          <b>{formatScore(game.score)}</b>
        </div>
        <div>QUAKE {game.quake}</div>
        <button
          onClick={() =>
            setGame((g) => ({
              ...g,
              status: g.status === "paused" ? "playing" : "paused",
            }))
          }
        >
          {game.status === "paused" ? "▶" : "Ⅱ"}
        </button>
        <button
          aria-label="Quit game"
          onClick={() => {
            setGame((current) => ({ ...current, status: "paused" }));
            setQuitConfirm(true);
          }}
        >
          ×
        </button>
      </header>
      <div className="timer">
        <div
          className="lava"
          style={{ clipPath: `inset(${(1 - progress) * 100}% 0 0 0)` }}
        />
        <b>{Math.ceil(game.remaining)}</b>
      </div>
      {game.status !== "paused" && (
        <div className="game-total">
          <span>TOTAL TILES:</span>
          {totalTileLabel(total(game)) ? (
            <img src={`/assets/total-tiles/${totalTileLabel(total(game))}.png`} alt={`Total ${total(game)}`} />
          ) : (
            <span>{total(game)}</span>
          )}
        </div>
      )}
      <section className="board">
        {game.board.map((slot, i) => {
          const card = slot.cards.at(-1);
          const visible = slot.cards.slice(-4);
          return (
            <button
              key={slot.id}
              className="tile"
              disabled={!card || game.status !== "playing"}
              onClick={() => setGame((g) => selectSlot(g, i))}
            >
              {visible.map((stackCard, layer) => (
                <span
                  className="stack-card"
                  key={stackCard.id}
                  aria-label={stackCard.label}
                  style={
                    {
                      zIndex: layer + 1,
                      backgroundImage: tileImage(stackCard.label),
                    } as React.CSSProperties
                  }
                />
              ))}
              {slot.cards.length > 4 && <small>×{slot.cards.length}</small>}
            </button>
          );
        })}
      </section>
      <section className="rack">
        {[0, 1, 2, 3, 4].map((i) => (
          <button
            key={i}
            disabled
            aria-label={game.held[i]?.label || `Empty holding slot ${i + 1}`}
            className={game.held[i] ? "held-tile-image" : ""}
            style={
              game.held[i]
                ? { backgroundImage: holdingTileImage(game.held[i].label) }
                : undefined
            }
          />
        ))}
      </section>
      <button
        className="quake"
        disabled={game.status !== "playing"}
        onClick={() => setGame(triggerQuake)}
      >
        QUAKE
      </button>
      {game.status === "paused" && !quitConfirm && (
        <div className="modal pause-modal">
          <h2>PAUSED</h2>
          <button onClick={() => setGame((g) => ({ ...g, status: "playing" }))}>
            RESUME
          </button>
          <button onClick={start}>RESTART</button>
          <button onClick={() => setScreen("settings")}>SETTINGS</button>
          <button onClick={() => setQuitConfirm(true)}>EXIT</button>
        </div>
      )}
      {quitConfirm && (
        <div
          className="modal quit-confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quit-title"
        >
          <h2 id="quit-title">QUIT GAME?</h2>
          <p>ARE YOU SURE YOU WANT TO QUIT THE GAME?</p>
          <div className="quit-actions">
            <button
              className="quit-yes"
              onClick={() => {
                setQuitConfirm(false);
                setScreen("lobby");
              }}
            >
              YES
            </button>
            <button
              onClick={() => {
                setQuitConfirm(false);
                setGame((current) => ({ ...current, status: "playing" }));
              }}
            >
              NO
            </button>
          </div>
        </div>
      )}
    </main>
    </div>
  );
}
function Shell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <main className={`phone shell ${className}`.trim()}>{children}</main>;
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2><span>{title}</span></h2>
      {children}
    </section>
  );
}
