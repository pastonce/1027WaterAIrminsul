import { useRef, useState } from 'react';
import { App } from './App';
import type { GameController } from '../game/core/GameController';
import type { Clock } from '../game/time/TimeGateService';
import type { ServerClock } from '../game/time/ServerClock';
import { PUBLIC_TESTING } from '../data/build';
import { FirstVisitNotice } from '../game/notice/firstVisit';
import { browserStorage } from '../game/save/SaveManager';

export interface GameSession { game: GameController; clock: Clock; timeSync?: ServerClock; testing?: boolean; previewing?: boolean }
export function SessionHost({ initial }: { initial: GameSession }) {
  const [session, setSession] = useState({ ...initial, generation: 0 }); const activating = useRef(false);
  const [firstNotice] = useState(() => new FirstVisitNotice(browserStorage()));
  const testing = async () => {
    if (!PUBLIC_TESTING || activating.current) return false;
    if (session.testing) return true;
    activating.current = true;
    try {
      const { createTestingSession } = await import('../dev/createTestingSession');
      const next = createTestingSession(session.game.getSnapshot().save);
      setSession((current) => ({ ...next, generation: current.generation + 1 }));
      return true;
    } catch { return false; }
    finally { activating.current = false; }
  };
  const birthday = async () => {
    if (activating.current || ['loading', 'waking', 'ending'].includes(session.game.getSnapshot().mode)) return false;
    activating.current = true;
    try {
      const { createBirthdaySession } = await import('../game/secrets/birthdaySession');
      const next = createBirthdaySession(session.game.getSnapshot().save);
      setSession((current) => ({ ...next, generation: current.generation + 1 }));
      return true;
    } catch { return false; }
    finally { activating.current = false; }
  };
  return <App key={session.generation} {...session} firstNotice={firstNotice} skipOpening={Boolean(session.testing || session.previewing)} onTesting={testing} onBirthday={birthday}/>;
}
