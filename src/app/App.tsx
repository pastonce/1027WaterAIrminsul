import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/Icon';
import { MusicButton } from '../components/MusicButton';
import { Settings } from '../components/Settings';
import { Notice } from '../components/Notice';
import { OpeningReveal } from '../components/OpeningReveal';
import { StageLoadingScreen } from '../components/StageLoadingScreen';
import { WakingReveal } from '../components/WakingReveal';
import { needsWakingReveal } from '../game/awakening/choreography';
import { IntroScene } from '../scenes/IntroScene';
import { DreamTreeScene } from '../scenes/DreamTreeScene';
import type { CameraActions } from '../scenes/DreamTreeScene';
import { RealityScene } from '../scenes/RealityScene';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useViewportSize } from '../hooks/useViewportSize';
import { useSecretKeyboard } from '../hooks/useSecretKeyboard';
import { PausableTimer } from '../game/core/PausableTimer';
import { EASTER_RULES } from '../game/secrets/codes';
import type { EasterCode } from '../game/secrets/codes';
import { PUBLIC_TESTING } from '../data/build';
import { BuildMarker } from '../components/BuildMarker';
import { startupPlan } from '../game/assets/startupPlan';
import type { StartupPlan } from '../game/assets/startupPlan';
import { GAME_RULES } from '../data/schedule';
import { sound } from '../game/core/SoundManager';
import { MusicManager } from '../game/audio/MusicManager';
import type { GameSnapshot } from '../types/game';
import type { GameController } from '../game/core/GameController';
import type { Clock } from '../game/time/TimeGateService';
import type { ServerClock } from '../game/time/ServerClock';
import { FirstVisitNotice } from '../game/notice/firstVisit';

const DebugPanel = PUBLIC_TESTING ? lazy(() => import('../dev/DebugPanel')) : null;

export function App({ game, clock, timeSync, testing = false, previewing = false, skipOpening = false, onTesting, onBirthday, firstNotice }: { game: GameController; clock: Clock; timeSync?: ServerClock; testing?: boolean; previewing?: boolean; skipOpening?: boolean; onTesting?: () => Promise<boolean>; onBirthday?: () => Promise<boolean>; firstNotice: FirstVisitNotice }) {
  const state = useSyncExternalStore(game.subscribe, game.getSnapshot);
  const systemReduced = useReducedMotion();
  const reduced = systemReduced || state.save.settings.reducedMotion;
  const viewport = useViewportSize();
  const portraitBlocked = viewport.width <= 900 && viewport.height > viewport.width;
  const [opening, setOpening] = useState(!skipOpening);
  const [openingPlan, setOpeningPlan] = useState<StartupPlan | null>(null);
  const [introPanel, setIntroPanel] = useState<'settings' | 'notice' | null>(null);
  const [firstNoticePending, setFirstNoticePending] = useState(firstNotice.pending);
  const [secretNotice, setSecretNotice] = useState<{ text: string } | null>(testing ? { text: '本页测试已开启，刷新后回到原来的梦。' } : null);
  const noticeTimer = useRef(new PausableTimer());
  const [hidden, setHidden] = useState(document.hidden);
  const [music] = useState(() => new MusicManager(() => sound.getContext()));
  const musicState = useSyncExternalStore(music.subscribe, music.getSnapshot);
  const cameraRef = useRef<CameraActions | null>(null);
  const reality = state.stage === 'G' && !state.reviewStage;
  const ready = state.mode === 'idle';
  const panelOpen = Boolean(introPanel) || state.mode === 'journal' || state.mode === 'settings' || state.mode === 'notice' || state.mode === 'mail';
  const wakingCover = state.stageLoading && needsWakingReveal(state.stageLoading.from, state.stageLoading.to, state.save.sceneStage);
  const inputBlocked = Boolean(state.stageLoading || state.waking) || panelOpen || firstNoticePending;
  const musicStage = state.reviewStage ?? state.stage;

  useLayoutEffect(() => {
    if (!opening || openingPlan) return;
    game.prepareOpeningAssets();
    const width = portraitBlocked ? viewport.height : viewport.width;
    const height = portraitBlocked ? viewport.width : viewport.height;
    const save = game.getSnapshot().save;
    const initialMusic = save.endingComplete ? 'G' : save.sceneStage ?? game.getSnapshot().stage;
    setOpeningPlan(startupPlan(save.loadingArtChoices, width, height, window.devicePixelRatio, reduced, initialMusic));
  }, [game, opening, openingPlan, viewport.width, viewport.height, reduced, portraitBlocked]);

  const redeem = async (code: EasterCode) => {
    if (code === 'birthday') return Boolean(onBirthday && await onBirthday());
    if (code === 'test') {
      if (!PUBLIC_TESTING || !onTesting || !await onTesting()) return false;
      setSecretNotice({ text: '本页测试已开启，刷新后回到原来的梦。' }); return true;
    }
    const feedback = game.easterEgg(code);
    if (!feedback) return false;
    setSecretNotice({ text: feedback }); return true;
  };
  useSecretKeyboard(redeem, opening || hidden || portraitBlocked);
  useEffect(() => { if (secretNotice) noticeTimer.current.schedule(() => setSecretNotice(null), EASTER_RULES.noticeMs); return () => noticeTimer.current.clear(); }, [secretNotice]);
  useLayoutEffect(() => { noticeTimer.current.setPaused(opening || hidden || portraitBlocked); }, [opening, hidden, portraitBlocked]);

  const configureSound = (snapshot: GameSnapshot) => sound.configure({
    volume: snapshot.save.settings.sound ? snapshot.save.settings.soundVolume : 0,
    paused: opening || hidden || portraitBlocked || ['intro', 'journal', 'settings', 'notice', 'mail', 'ending', 'waking'].includes(snapshot.mode),
    transitioning: Boolean(snapshot.stageLoading),
    scope: snapshot.stageLoading ? `loading-${snapshot.stageLoading.id}` : `${snapshot.reviewStage ?? snapshot.stage}-${snapshot.reviewStage ? 'review' : 'play'}`,
  });

  useLayoutEffect(() => { configureSound(state); }, [state, opening, hidden, portraitBlocked]);
  useEffect(() => game.subscribeSound((kind) => { configureSound(game.getSnapshot()); void sound.play(kind); }), [game, opening, hidden, portraitBlocked]);

  const configureMusic = (snapshot: GameSnapshot) => music.configure({ stage: snapshot.mode === 'intro' ? null : snapshot.reviewStage ?? snapshot.stage, enabled: snapshot.save.settings.music, volume: snapshot.save.settings.musicVolume, paused: opening || hidden || portraitBlocked || ['intro', 'journal', 'settings', 'notice', 'mail', 'loading', 'ending', 'waking'].includes(snapshot.mode), immediate: hidden || portraitBlocked || opening });
  useLayoutEffect(() => { configureMusic(state); }, [music, musicStage, state.save.settings.music, state.save.settings.musicVolume, state.mode, opening, hidden, portraitBlocked]);

  useLayoutEffect(() => { game.setSystemReducedMotion(systemReduced); }, [game, systemReduced]);
  useLayoutEffect(() => { if (state.mode !== 'intro') setIntroPanel(null); }, [state.mode]);
  useLayoutEffect(() => {
    if (!firstNoticePending || opening || hidden || portraitBlocked) return;
    if (state.mode === 'intro') setIntroPanel('notice');
    else if (['idle', 'watering', 'growing'].includes(state.mode)) game.openPanel('notice');
    else return;
    firstNotice.shown();
    setFirstNoticePending(false);
  }, [firstNotice, firstNoticePending, opening, hidden, portraitBlocked, state.mode, game]);

  const unlockMusic = (target: EventTarget | null) => {
    if (!opening && !hidden && !portraitBlocked && state.save.settings.sound) void sound.unlock();
    if (target instanceof Element && target.closest('.music-button')) return;
    if (!opening && !hidden && !portraitBlocked && state.save.settings.music && musicStage && musicState.phase !== 'error') void music.unlock();
  };
  const toggleMusic = () => {
    if (!state.save.settings.music || ['blocked', 'error', 'waiting'].includes(musicState.phase)) {
      game.setSettings({ music: true, musicVolume: state.save.settings.musicVolume || 0.45 });
      configureMusic(game.getSnapshot());
      void music.requestPlay();
    }
    else game.setSettings({ music: false });
  };

  useEffect(() => {
    game.start();
    return () => { music.dispose(); game.stop(); sound.dispose(); };
  }, [game, music]);

  useEffect(() => {
    if (!timeSync) return;
    const unsubscribe = timeSync.subscribe(() => game.tick());
    const resume = () => { if (!document.hidden) void timeSync.synchronize(); };
    timeSync.start();
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      unsubscribe();
      timeSync.stop();
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [game, timeSync]);

  useLayoutEffect(() => {
    const visibility = () => { setHidden(document.hidden); game.setSuspended(opening || firstNoticePending || document.hidden || portraitBlocked); };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [game, portraitBlocked, opening, firstNoticePending]);

  const fullScreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        const orientation = screen.orientation as ScreenOrientation & { lock?: (direction: string) => Promise<void> };
        await orientation.lock?.('landscape');
      } else await document.exitFullscreen();
    } catch { return; }
  };

  return <OpeningReveal active={opening} reduced={reduced} paused={hidden || portraitBlocked} plan={openingPlan} onComplete={() => setOpening(false)}><div className={`game-app ${reduced ? 'reduced-motion' : ''} ${state.mode === 'ending' ? 'is-awakening' : ''}`} data-testing={testing} data-previewing={previewing} data-first-notice={firstNoticePending ? 'pending' : 'complete'} onPointerDownCapture={(event) => { game.activity(); unlockMusic(event.target); }} onClickCapture={(event) => { game.activity(); unlockMusic(event.target); }} onKeyDownCapture={(event) => { if (!event.repeat) { game.activity(); unlockMusic(event.target); } }}>
    <div className="game-content" inert={inputBlocked} aria-hidden={inputBlocked || undefined}>
    {state.mode === 'intro' ? <><IntroScene message={state.message} onEnter={() => game.enterDream()} onSettings={() => setIntroPanel('settings')} onNotice={() => setIntroPanel('notice')}/>{introPanel === 'settings' && <Settings game={game} state={state} timeSync={timeSync} testing={testing} previewing={previewing} redeem={redeem} onClose={() => setIntroPanel(null)}/>} {introPanel === 'notice' && <Notice reduced={reduced} onClose={() => setIntroPanel(null)}/>}</> : <>
      {reality ? <RealityScene game={game} state={state} reduced={reduced} testing={testing} suspended={opening || hidden || portraitBlocked}/> : <DreamTreeScene game={game} state={state} reduced={reduced} cameraRef={cameraRef} testing={testing}/>}
      <header className="game-header" data-mail-open={state.mode === 'mail'}>
        <div className="game-brand"><Icon name="leaf" size={26}/><div><span><span>浇灌一棵世界树</span><BuildMarker/></span><small>WATER AN IRMINSUL</small></div></div>
        <div className="header-actions">
          {!reality && <div key={state.dewFeedbackRevision} className={`dew-counter ${state.save.dew === GAME_RULES.dewCapacity ? 'is-full' : ''} ${state.dewFeedback ? 'dew-feedback' : ''}`} data-feedback={state.dewFeedback ?? undefined} aria-label={`梦露 ${state.save.dew} / ${GAME_RULES.wateringCost}`}>
            <Icon name="dew" size={22}/><b data-testid="dew-count">{state.save.dew}</b><span>/ {GAME_RULES.wateringCost}</span>
            {state.dewFeedback && <span className="sr-only" role="status">{state.dewFeedback === 'full' ? '梦露已满' : '梦露不足'}</span>}
          </div>}
          <button className="icon-button header-tool-button notice-button" onClick={() => game.openPanel('notice')} disabled={!['idle', 'watering', 'growing', 'journal', 'settings', 'notice'].includes(state.mode)} aria-label="公告与声明" title="公告与声明" data-notice-opener><Icon name="notice"/></button>
          <button className="icon-button header-tool-button" onClick={() => game.openPanel('settings')} disabled={!['idle', 'watering', 'growing', 'journal', 'settings', 'notice'].includes(state.mode)} aria-label="设置" title="设置" data-panel-opener><Icon name="settings"/></button>
          <MusicButton enabled={state.save.settings.music} available={musicStage !== null} state={musicState} onToggle={toggleMusic}/>
          <button className="icon-button header-tool-button fullscreen-button" onClick={() => void fullScreen()} aria-label="全屏横屏体验" title="全屏"><Icon name="fullscreen" size={20}/></button>
        </div>
      </header>
      {!reality && (state.reviewStage ? <button className="primary-button water-action" onClick={() => game.review(null)} aria-label="回到现实">回到现实<Icon name="arrow" size={19}/></button> : <button className={`primary-button water-action ${state.save.dew < GAME_RULES.wateringCost ? 'needs-dew' : ''}`} onClick={() => game.water()} disabled={!ready} aria-label="浇灌梦中的树"><Icon name="dew" size={22}/><span>浇灌</span></button>)}
      {state.saveStatus && <div className="save-warning" role="status">{state.saveStatus}</div>}
      {state.mode === 'settings' && <Settings game={game} state={state} timeSync={timeSync} testing={testing} previewing={previewing} redeem={redeem}/>}
      {state.mode === 'notice' && <Notice reduced={reduced} onClose={() => game.closePanel()}/>}
      <div className="awakening-light" aria-hidden="true"/>
    </>}
    {DebugPanel && (import.meta.env.DEV || testing) && <Suspense fallback={null}><DebugPanel game={game} state={state} clock={clock} ephemeral={testing} onCamera={(target) => cameraRef.current?.goTo(target)}/></Suspense>}
    </div>
    {(wakingCover || state.waking) && <WakingReveal playback={state.waking} paused={opening || hidden || portraitBlocked} portrait={portraitBlocked}/>}
    {state.stageLoading && <StageLoadingScreen key={state.stageLoading.id} loading={state.stageLoading} paused={hidden || portraitBlocked} reduced={reduced} portrait={portraitBlocked} onArtReady={(id, artId) => game.stageArtworkReady(id, artId)}/>}
    {secretNotice && createPortal(<div className="secret-toast" role="status">{secretNotice.text}</div>, document.body)}
    {createPortal(<div className="rotate-overlay"><Icon name="leaf" size={42}/><h2>把梦，轻轻转过来。</h2><p>请将手机横放。</p><button className="primary-button" onClick={() => void fullScreen()}>开启横屏体验<Icon name="fullscreen" size={18}/></button></div>, document.body)}
  </div></OpeningReveal>;
}
