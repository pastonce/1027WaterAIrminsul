import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { SessionHost } from './app/SessionHost';
import { GameController } from './game/core/GameController';
import { browserStorage, SaveManager, SAVE_KEYS } from './game/save/SaveManager';
import { TimeGateService } from './game/time/TimeGateService';
import type { Clock } from './game/time/TimeGateService';
import { ServerClock } from './game/time/ServerClock';
import './styles/fonts.css';
import './styles/game.css';
import './styles/interactions.css';
import './styles/dialogue-themes.css';
import './styles/expressions.css';
import './styles/backgrounds.css';
import './styles/intro.css';
import './styles/inhabitants.css';
import './styles/blessing.css';
import './styles/opening.css';
import './styles/loading.css';
import './styles/waking.css';
import './styles/birthday.css';
import './styles/secrets.css';
import './styles/media.css';
import './styles/header.css';
import './styles/notice.css';
import './styles/birthday-mail.css';
import './styles/tree.css';
import './styles/planting.css';
import './styles/cursors.generated.css';

class DreamBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Dream rendering failed', error, info.componentStack); }
  render() {
    return this.state.failed ? <main className="error-screen"><h1>梦境暂时起了一点雾。</h1><p>进度已保存在本地。刷新页面，让我们重新找到那棵树。</p><button onClick={() => window.location.reload()}>重新进入梦境</button></main> : this.props.children;
  }
}

async function bootstrap() {
  let clock: Clock;
  let timeSync: ServerClock | undefined;
  if (import.meta.env.DEV) {
    const { DevelopmentClock } = await import('./dev/DevelopmentClock');
    clock = new DevelopmentClock();
  } else {
    timeSync = new ServerClock();
    clock = timeSync;
  }
  const saves = new SaveManager(browserStorage(), import.meta.env.DEV ? SAVE_KEYS.development : SAVE_KEYS.player);
  const game = new GameController(new TimeGateService(clock), saves);
  createRoot(document.getElementById('root')!).render(<DreamBoundary><SessionHost initial={{ game, clock, timeSync }}/></DreamBoundary>);
}

void bootstrap();
