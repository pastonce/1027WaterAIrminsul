import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { preload } from 'react-dom';
import { Atmosphere } from '../components/Atmosphere';
import { DialogueBubble } from '../components/DialogueBubble';
import { ExpressionBubble } from '../components/ExpressionBubble';
import { treeExpressionAnchor, visitExpressionAnchor } from '../game/expressions/placement';
import { NahidaAvatar } from '../components/NahidaAvatar';
import { Icon } from '../components/Icon';
import { TreeRenderer } from '../components/TreeRenderer';
import { DendroBlessing } from '../components/DendroBlessing';
import { STAGES } from '../data/stages';
import { E_SKILL_PATTERN, getStageBackground } from '../data/assets';
import { VISIT_FORMS } from '../data/inhabitants';
import { PRESENTATION_RULES } from '../data/presentation';
import { ForestInhabitants } from '../components/ForestInhabitants';
import type { DreamStageId } from '../types/game';
import type { BackgroundAsset } from '../data/assets';
import { forestGround } from '../game/backgrounds/projection';
import { FOREST_ENTRANCE_SECONDS } from '../game/backgrounds/entrance';
import { getTreeHeight } from '../game/growth/GrowthSystem';
import { dreamLayout } from '../game/camera/sceneLayout';
import { RoamingLayer } from '../game/encounters/RoamingLayer';
import type { GameController } from '../game/core/GameController';
import type { GameSnapshot } from '../types/game';
import { useSceneViewport } from '../hooks/useSceneViewport';
import { sceneRoot } from '../game/tree/scenePlacement';
import { DREAM_STAGES } from '../types/game';
import { getLoadingArt } from '../data/stageLoading';
import { StageArtPrefetcher } from '../game/loading/StageArtPrefetcher';
import { SeedPlanting } from '../components/SeedPlanting';
import { InteractionCue } from '../components/InteractionCue';
import type { SeedOrigin } from '../data/seed';
import { GAME_RULES } from '../data/schedule';
import { proceduralHeight } from '../game/tree/procedural';

export function DreamTreeScene({ game, state, reduced, testing = false, seedOrigin = null }: { game: GameController; state: GameSnapshot; reduced: boolean; testing?: boolean; seedOrigin?: SeedOrigin | null }) {
  const inhabitants = useMemo(() => new RoamingLayer(), []);
  const artworkPrefetch = useMemo(() => new StageArtPrefetcher(), []);
  const stage = STAGES[state.reviewStage ?? state.stage];
  const height = state.proceduralTree ? proceduralHeight(state.reviewStage ? stage.growth.end : state.growth) : getTreeHeight(state.reviewStage ? stage.growth.end : state.growth);
  const locked = state.mode === 'ending' || state.mode === 'loading';
  const camera = useSceneViewport(locked);
  const background = getStageBackground(stage.id);
  const entrance = useRef({ asset: background, time: reduced ? Infinity : 0 });
  const sceneryReady = useRef<BackgroundAsset | null | undefined>(undefined);
  const seedFrame = useRef<HTMLDivElement>(null);
  const loadingId = state.stageLoading?.id;
  const backgroundReady = useCallback((asset: BackgroundAsset | null) => {
    if (asset !== background) return;
    sceneryReady.current = asset;
    if (stage.id === 'A' && entrance.current.asset === asset && entrance.current.time >= FOREST_ENTRANCE_SECONDS) game.sceneEntranceReady('A');
    if (loadingId !== undefined) game.stageSceneReady(loadingId, stage.id);
    else if (state.mode === 'idle' && !state.presentationPaused && !state.reviewStage) {
      const next = ([...DREAM_STAGES, 'G'] as const)[DREAM_STAGES.indexOf(stage.id as DreamStageId) + 1];
      const selected = state.save.loadingArtChoices[next];
      const artwork = selected && getLoadingArt(next, selected);
      if (artwork) artworkPrefetch.prepare(artwork, camera.viewport.width, camera.viewport.height, window.devicePixelRatio || 1);
    } else artworkPrefetch.cancel();
  }, [background, loadingId, game, stage.id, state.mode, state.presentationPaused, state.reviewStage, state.save.loadingArtChoices, artworkPrefetch, camera.viewport.width, camera.viewport.height]);
  useEffect(() => () => artworkPrefetch.cancel(), [artworkPrefetch, stage.id]);
  const ground = forestGround(background, camera.viewport.width, camera.viewport.height);
  const blessingGround = useRef<((offset: number) => void) | null>(null);
  const companionRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.companion) preload(E_SKILL_PATTERN.texture, { as: 'image' }); }, [state.companion]);
  const presentGround = useCallback((asset: BackgroundAsset | null, time: number) => {
    if (asset !== background) return;
    entrance.current = { asset, time };
    const position = forestGround(asset, camera.viewport.width, camera.viewport.height, time)?.entrance ?? 0;
    blessingGround.current?.(position);
    camera.viewportRef.current?.style.setProperty('--ground-entrance-y', `${position}px`);
    if (camera.viewportRef.current) camera.viewportRef.current.dataset.groundEntrance = String(position);
    if (seedFrame.current?.dataset.phase === 'arriving') {
      const progress = Math.max(0, Math.min(1, time / FOREST_ENTRANCE_SECONDS));
      seedFrame.current.style.setProperty('--seed-entry-x', `${((seedOrigin?.x ?? camera.viewport.width / 2) - camera.viewport.width / 2) * (1 - progress)}px`);
      seedFrame.current.style.setProperty('--seed-entry-y', `${((seedOrigin?.y ?? camera.viewport.height / 2) - camera.viewport.height / 2) * (1 - progress)}px`);
      seedFrame.current.style.setProperty('--seed-entry-scale', String(seedOrigin ? 1 + (seedOrigin.width / (camera.viewport.height <= 600 ? 48 : 64) - 1) * (1 - progress) : 1));
    }
    if (stage.id === 'A' && sceneryReady.current === asset && time >= FOREST_ENTRANCE_SECONDS) game.sceneEntranceReady('A');
  }, [background, camera.viewport.width, camera.viewport.height, camera.viewportRef, game, stage.id, state.growthRevision, seedOrigin]);
  useLayoutEffect(() => {
    presentGround(background, reduced ? Infinity : entrance.current.asset === background ? entrance.current.time : 0);
  }, [background, presentGround, reduced]);
  const variant = VISIT_FORMS[state.companionStage ?? stage.id] ?? 'dream';
  const visibleGrowth = state.reviewStage ? stage.growth.end : state.growth;
  const root = sceneRoot(camera.viewport.height, camera.scale, ground?.root);
  const layout = dreamLayout(camera.viewport.width, camera.viewport.height, camera.scale, height, 0, root, variant, state.companionStage ?? stage.id as DreamStageId, state.companionPosition, visibleGrowth, state.proceduralTree, state.save.seed);
  const creatureViewport = useMemo(() => ({ ...camera.viewport, offset: 0, root, treeHeight: height, seed: state.save.seed, growth: visibleGrowth, procedural: state.proceduralTree }), [camera.viewport, root, height, state.save.seed, visibleGrowth, state.proceduralTree]);
  useLayoutEffect(() => { game.setDewViewport(camera.viewport); }, [game, camera.viewport]);
  const firstDew = state.save.seedPlanted && state.save.growth === 0 && state.save.dew < GAME_RULES.wateringCost ? state.dewParticles.find((particle) => !particle.collected && !particle.expiring && !particle.launch) : undefined;

  return <div className={`dream-scene ${state.mode === 'watering' ? 'is-watering' : ''}`} ref={camera.viewportRef} {...camera.bindings} data-testid="dream-scene" data-paused={state.presentationPaused} data-camera-offset={Math.round(camera.offset)}>
    <Atmosphere stage={stage} offset={camera.offset} reduced={reduced} effects={state.effects} night={false} paused={state.presentationPaused} onBackgroundFrame={presentGround} onBackgroundReady={backgroundReady} inhabitants={inhabitants}/>
    <div className="ground-light" style={{ top: root - 42.5, bottom: 'auto', transform: 'translateY(var(--ground-entrance-y, 0px))' }}/>
    <div className="camera-world" style={{ transform: `translateY(calc(${camera.offset}px + var(--ground-entrance-y, 0px)))` }}>
      <div className="tree-world" style={{ bottom: camera.viewport.height - root - 100 * camera.scale, transform: `translateX(-50%) scale(${camera.scale})` }}>
        <TreeRenderer growth={visibleGrowth} stage={stage.id} reduced={reduced} paused={state.presentationPaused} compact={camera.viewport.height <= 600} procedural={state.proceduralTree} seed={state.save.seed} growing={state.mode === 'growing' || state.blessing?.phase === 'bloom'} onInteract={(keyboard) => { if (keyboard || !camera.consumeDragClick()) game.talk(); }}/>
      </div>
    </div>
    <ForestInhabitants game={game} state={state} stage={stage.id as DreamStageId} viewport={creatureViewport} reduced={reduced} inhabitants={inhabitants}/>
    <div className="dew-layer" aria-label="梦露">
      {firstDew && <InteractionCue className="dew-collect-hint" label="轻触收集梦露" paused={state.presentationPaused} reduced={reduced} style={{ left: `${firstDew.x}%`, top: `${firstDew.y}%` }}/>}
      {state.rewardBursts.map((burst) => <div key={burst.id} className="reward-burst" style={{ left: `${burst.x}%`, top: `${burst.y}%` }} aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ '--scatter-x': `${Math.cos(index * 2.4) * (45 + index * 4)}px`, '--scatter-y': `${Math.sin(index * 2.4) * (45 + index * 3) - 30}px`, animationDelay: `${index % 4 * 0.025}s` } as CSSProperties}/>)}</div>)}
      {state.dewParticles.map((particle) => <button key={particle.id} data-dew-id={particle.id} data-dew-kind={particle.kind ?? 'ordinary'} data-launching={Boolean(particle.launch)} className={`dew-particle ${particle.kind === 'reward' ? 'is-reward' : ''} ${particle.collected ? 'is-collected' : ''} ${particle.expiring ? 'is-expiring' : ''}`} aria-label="梦露" disabled={particle.collected || particle.expiring || Boolean(particle.launch) || !['idle', 'watering', 'growing'].includes(state.mode)}
        style={{ left: `${particle.x}%`, top: `${particle.y}%`, color: stage.dew.color, '--float-delay': `${-particle.id * 0.7}s`, '--flight-x': `calc(100vw - 180px - ${particle.x}vw)`, '--flight-y': `calc(48px - ${particle.y}vh)`, '--launch-x': `${((particle.launch?.x ?? particle.x) - particle.x) * camera.viewport.width / 100}px`, '--launch-y': `${((particle.launch?.y ?? particle.y) - particle.y) * camera.viewport.height / 100}px` } as CSSProperties}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') game.collectDew(particle.id); }}
        onClick={() => game.collectDew(particle.id)}><span className="dew-visual"><Icon name="dew" size={23}/></span></button>)}
    </div>
    {!state.save.seedPlanted && stage.id === 'A' && state.seedPhase && <SeedPlanting phase={state.seedPhase} width={camera.viewport.width} height={camera.viewport.height} root={root} scale={camera.scale} origin={seedOrigin} frameRef={seedFrame} paused={state.presentationPaused} reduced={reduced} onPlant={() => game.plantSeed()}/>}
    {state.companion && <div ref={companionRef} className="nahida-companion" data-position={state.companionPosition} data-blessing={state.blessing?.phase ?? 'none'} data-paused={state.presentationPaused} data-reduced={reduced} style={{ ...layout.character, '--blessing-duration': `${PRESENTATION_RULES.blessingTravelMs}ms` } as CSSProperties}><NahidaAvatar action={state.companion} variant={variant} paused={state.presentationPaused} reduced={reduced} placeholder={state.nahidaPlaceholder}/><button className="companion-interact" aria-label="和纳西妲说话" data-no-drag disabled={!state.companionCanTalk || state.presentationPaused || !['idle', 'watering', 'growing'].includes(state.mode)} onClick={(event) => { if (!event.detail || !camera.consumeDragClick()) game.talkToCompanion(); }}/></div>}
    {state.blessing && <DendroBlessing procedural={state.proceduralTree} seed={state.save.seed} width={camera.viewport.width} height={camera.viewport.height} scale={camera.scale} root={root} treeHeight={height} growth={visibleGrowth} character={layout.character} characterRef={companionRef} emitter={layout.characterEmission} phase={state.blessing.phase} paused={state.presentationPaused} reduced={reduced} groundFrame={blessingGround} entranceOffset={forestGround(background, camera.viewport.width, camera.viewport.height, entrance.current.time)?.entrance ?? 0}/>}
    {state.speech && !state.presentationPaused && <DialogueBubble speech={state.speech} reduced={reduced} testing={testing} position={state.speech.anchor === 'nahida' ? layout.characterBubble : layout.treeBubble} side={state.speech.anchor === 'nahida' ? layout.characterBubbleSide : 'left'} onSegments={game.setSpeechSegments} onHover={game.hoverSpeech} onReveal={game.revealExpression}/>}
    {state.expression?.anchor === 'tree' && <ExpressionBubble key={state.expression.id} playback={state.expression} anchor={treeExpressionAnchor(camera.viewport.width, root, visibleGrowth, camera.scale, camera.viewport.height, stage.id as DreamStageId, state.proceduralTree, state.save.seed)} width={camera.viewport.width} height={camera.viewport.height} paused={state.presentationPaused} reduced={reduced} ground onReady={game.expressionReady} onDismiss={game.dismissExpression}/>}
    {state.expression?.anchor === 'nahida' && state.companion && <ExpressionBubble key={state.expression.id} playback={state.expression} anchor={visitExpressionAnchor(layout.character, state.companionStage ?? stage.id as DreamStageId)} width={camera.viewport.width} height={camera.viewport.height} paused={state.presentationPaused} reduced={reduced} obstacles={state.speech ? [{ ...(state.speech.anchor === 'nahida' ? layout.characterBubble : layout.treeBubble), height: camera.viewport.height <= 600 ? 100 : 128 }] : []} onReady={game.expressionReady} onDismiss={game.dismissExpression}/>}
    {state.effects.includes('birthday') && <div className="birthday-sigil">10 <Icon name="spark" size={18}/> 27<span>愿慧梦成真</span></div>}
    {state.mode === 'watering' && <div className="watering-rain" aria-hidden="true"><i/><i/><i/><i/><i/></div>}
  </div>;
}
