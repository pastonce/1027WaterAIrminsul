import { useRef, useState } from 'react';
import { App } from './App';
import type { GameController } from '../game/core/GameController';
import type { Clock } from '../game/time/TimeGateService';
import type { ServerClock } from '../game/time/ServerClock';
import { PUBLIC_TESTING } from '../data/build';
import { FirstVisitNotice } from '../game/notice/firstVisit';
import { browserStorage } from '../game/save/SaveManager';

export interface GameSession { game: GameController; clock: Clock; timeSync?: ServerClock; testing?: boolean; previewing?: boolean; sessionNotice?: string }
export function SessionHost({ initial }: { initial: GameSession }) {
  const [session, setSession] = useState({ ...initial, generation: 0 }); const activating = useRef(false);
  const previousSession = useRef<GameSession | null>(null);
  const [firstNotice] = useState(() => new FirstVisitNotice(browserStorage()));
  const testing = async () => {
    if (!PUBLIC_TESTING || activating.current) return false;
    activating.current = true;
    try {
      if (session.testing) {
        const previous = previousSession.current ?? initial;
        previous.game.closePanel();
        previousSession.current = null;
        setSession((current) => ({ ...previous, sessionNotice: '已退出本页测试，回到原来的梦。', generation: current.generation + 1 }));
        return true;
      }
      const { createTestingSession } = await import('../dev/createTestingSession');
      const next = createTestingSession(session.game.getSnapshot().save);
      previousSession.current = session;
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
      setSession((current) => ({ ...next, testing: current.testing, generation: current.generation + 1 }));
      return true;
    } catch { return false; }
    finally { activating.current = false; }
  };
  return <App key={session.generation} {...session} firstNotice={firstNotice} skipOpening={session.generation > 0 || Boolean(session.testing || session.previewing)} onTesting={testing} onBirthday={birthday}/>;
}
