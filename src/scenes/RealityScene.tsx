import { useCallback, useEffect, useState } from 'react';
import { Atmosphere } from '../components/Atmosphere';
import { NahidaAvatar } from '../components/NahidaAvatar';
import { DialogueBubble } from '../components/DialogueBubble';
import { ExpressionBubble } from '../components/ExpressionBubble';
import { BirthdayOffering } from '../components/BirthdayOffering';
import { BirthdayEnvelopes } from '../components/BirthdayEnvelopes';
import { BirthdayMailBook } from '../components/BirthdayMailBook';
import type { OpenedEnvelope } from '../components/BirthdayMailBook';
import { Icon } from '../components/Icon';
import { STAGES } from '../data/stages';
import { realityLayout } from '../game/camera/sceneLayout';
import { nahidaExpressionAnchor } from '../game/expressions/placement';
import { useViewportSize } from '../hooks/useViewportSize';
import type { GameController } from '../game/core/GameController';
import type { GameSnapshot } from '../types/game';

export function RealityScene({ game, state, reduced, testing = false, suspended = false }: { game: GameController; state: GameSnapshot; reduced: boolean; testing?: boolean; suspended?: boolean }) {
  const viewport = useViewportSize();
  const layout = realityLayout(viewport.width, viewport.height);
  const loadingId = state.stageLoading?.id;
  const [opened, setOpened] = useState<OpenedEnvelope | null>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => { if (state.mode !== 'mail') { setOpened(null); setReturning(false); } }, [state.mode]);
  const openLetter = (index: number, button: HTMLButtonElement) => {
    const bounds = button.getBoundingClientRect();
    if (!game.openBirthdayMail()) return;
    setReturning(false);
    setOpened({ index, button, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height });
  };
  const backgroundReady = useCallback(() => { if (loadingId !== undefined) game.stageSceneReady(loadingId, 'G'); }, [game, loadingId]);
  return <div className="reality-scene" data-testid="reality-scene" data-mail-open={Boolean(opened) && !returning}>
    <Atmosphere stage={STAGES.G} offset={0} reduced={reduced} effects={state.effects} night={false} paused={state.presentationPaused} onBackgroundReady={backgroundReady}/>
    <div className="courtyard-arch" aria-hidden="true"><span/><span/><span/></div>
    <div className="reality-copy"><h1>生日快乐<br/><em>纳西妲</em></h1></div>
    <button className="reality-character" style={{ ...layout.character, bottom: 'auto' }} onClick={() => game.talk()} disabled={!['idle', 'watering', 'growing'].includes(state.mode)} aria-label="和纳西妲聊天"><NahidaAvatar action="happy" variant="reality" paused={state.presentationPaused} reduced={reduced} placeholder={state.nahidaPlaceholder}/></button>
    {state.birthday && <BirthdayOffering key={`${state.birthday.id}-${state.birthday.phase}`} playback={state.birthday} paused={state.presentationPaused} width={viewport.width} height={viewport.height}/>}
    {state.speech && !state.presentationPaused && <DialogueBubble speech={state.speech} position={state.speech.anchor === 'nahida' ? layout.bubble : layout.userBubble} reduced={reduced} testing={testing} side={state.speech.anchor === 'nahida' ? layout.bubbleSide : 'bottom'} onSegments={game.setSpeechSegments} onHover={game.hoverSpeech} onReveal={game.revealExpression}/>}
    {state.expression?.anchor === 'nahida' && <ExpressionBubble key={state.expression.id} playback={state.expression} anchor={nahidaExpressionAnchor(layout.character)} width={viewport.width} height={viewport.height} obstacles={state.speech ? [{ ...(state.speech.anchor === 'nahida' ? layout.bubble : { ...layout.userBubble, top: viewport.height - layout.userBubble.bottom - (viewport.height <= 600 ? 83 : 128) }), height: viewport.height <= 600 ? 83 : 128 }] : []} paused={state.presentationPaused} reduced={reduced} onReady={game.expressionReady} onDismiss={game.dismissExpression}/>}
    <div className="reality-menu">
      <BirthdayEnvelopes disabled={state.mode !== 'idle' || state.save.pendingDialogues.some((entry) => entry.kind === 'wish')} paused={state.presentationPaused} reduced={reduced} opened={opened?.index ?? null} onOpen={openLetter}/>
      <div className="reality-actions"><button className="primary-button" onClick={() => game.sendWish()} disabled={state.mode !== 'idle' || state.save.pendingDialogues.some((entry) => entry.kind === 'wish')}><Icon name="leaf"/>送上生日祝福</button><button className="text-button" onClick={() => game.review('F')} disabled={state.mode !== 'idle'}><Icon name="book" size={18}/>回望那场长梦</button></div>
    </div>
    {opened && state.mode === 'mail' && <BirthdayMailBook origin={opened} paused={suspended} reduced={reduced} onReturning={() => setReturning(true)} onComplete={() => { setOpened(null); game.closePanel(); }}/>}
  </div>;
}
