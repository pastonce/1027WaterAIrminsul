import { useRef, useState } from 'react';
import { App } from './App';
import type { GameController } from '../game/core/GameController';
import type { Clock } from '../game/time/TimeGateService';
import type { ServerClock } from '../game/time/ServerClock';
import { PUBLIC_TESTING } from '../data/build';

export interface GameSession { game: GameController; clock: Clock; timeSync?: ServerClock; testing?: boolean }
export function SessionHost({ initial }: { initial: GameSession }) {
  const [session, setSession] = useState(initial); const activating = useRef(false);
  const testing = async () => {
    if (!PUBLIC_TESTING || activating.current) return false;
    if (session.testing) return true;
    activating.current = true;
    try {
      const { createTestingSession } = await import('../dev/createTestingSession');
      setSession(createTestingSession(session.game.getSnapshot().save));
      return true;
    } catch { return false; }
    finally { activating.current = false; }
  };
  return <App key={session.testing ? 'session-testing' : 'normal'} {...session} skipOpening={Boolean(session.testing)} onTesting={testing}/>;
}
