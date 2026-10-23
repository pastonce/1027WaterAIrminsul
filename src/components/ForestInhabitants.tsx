import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { HIDING_PLACES, INHABITANT_ASSETS, ROAMING_ARANARA } from '../data/inhabitants';
import type { InhabitantId } from '../data/inhabitants';
import { creatureLayout } from '../game/encounters/layout';
import type { CreatureViewport } from '../game/encounters/layout';
import { createCreatureRenderer } from '../game/encounters/CreatureRenderer';
import type { CreatureRenderer } from '../game/encounters/CreatureRenderer';
import type { GameController } from '../game/core/GameController';
import type { DreamStageId, GameSnapshot } from '../types/game';
import type { RoamingLayer } from '../game/encounters/RoamingLayer';
import { getStageBackground } from '../data/backgrounds';
import { backgroundParallax, BACKGROUND_RULES } from '../game/backgrounds/policy';
import { roamingVariables } from '../game/encounters/motion';

export function ForestInhabitants({ game, state, stage, viewport, reduced, inhabitants }: { game: GameController; state: GameSnapshot; stage: DreamStageId; viewport: CreatureViewport; reduced: boolean; inhabitants: RoamingLayer }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<CreatureRenderer | null>(null);
  const [statuses, setStatuses] = useState<Partial<Record<InhabitantId, 'loading' | 'ready' | 'fallback'>>>({});
  const [failed, setFailed] = useState(false);
  const [bytes, setBytes] = useState(0);
  const actors = useMemo(() => creatureLayout(stage, state.encounters, viewport, state.save.claimedAranara), [stage, state.encounters, viewport, state.save.claimedAranara]);
  const floating = useMemo(() => actors.filter((actor) => actor.kind !== 'roaming'), [actors]);
  const roaming = useMemo(() => actors.filter((actor) => actor.kind === 'roaming'), [actors]);
  const native = useSyncExternalStore(inhabitants.subscribe, inhabitants.snapshot);
  const parallax = backgroundParallax(viewport.offset, viewport.height);
  const latest = useRef({ actors: floating, viewport, paused: state.presentationPaused, reduced });
  useLayoutEffect(() => { inhabitants.setActors(reduced ? [] : roaming.map((actor) => ({ ...actor, top: actor.top - parallax })), viewport.width, viewport.height); }, [inhabitants, roaming, parallax, viewport.width, viewport.height, reduced]);
  useEffect(() => () => inhabitants.setActors([], 1, 1), [inhabitants]);
  useLayoutEffect(() => {
    const probes = creatureLayout(stage, (HIDING_PLACES[stage] ?? []).flatMap((anchor, slot) => (anchor.allowed ?? ROAMING_ARANARA).map((asset) => ({ id: slot, slot, asset, phase: 'watching' }))), viewport, []);
    const visible = (actor: (typeof probes)[number]) => {
      const area = actor.hit; if (!area) return false;
      const corridor = viewport.width / 2; const clearance = 330 * viewport.scale + 8;
      if (actor.edge === 'top') return area.left > 205 && area.left + 44 < viewport.width - 230;
      if (actor.edge === 'bottom') return area.left + 44 < viewport.width - 190 && (area.left + 44 < corridor - clearance || area.left > corridor + clearance);
      return area.left >= 4 && area.left + area.width <= viewport.width - 8 && area.top >= 112 && area.top + area.height <= viewport.height - 92
        && (area.left + area.width < corridor - clearance || area.left > corridor + clearance);
    };
    game.setAranaraSlots((HIDING_PLACES[stage] ?? []).flatMap((_, slot) => probes.filter((actor) => actor.encounter === slot).every(visible) ? [slot] : []));
  }, [game, stage, viewport]);
  useEffect(() => () => game.setAranaraSlots(null), [game]);
  useLayoutEffect(() => {
    game.setDewObstacles(actors.filter((actor) => actor.kind === 'fixed' || actor.kind === 'roaming').map((actor) => {
      const area = actor.hit ?? actor; return { left: area.left, top: area.top, width: Math.max(44, area.width), height: Math.max(44, area.height) };
    }));
  }, [game, actors]);
  useEffect(() => () => game.setDewObstacles([]), [game]);
  useLayoutEffect(() => {
    latest.current = { actors: floating, viewport, paused: state.presentationPaused, reduced };
    if (renderer.current) {
      renderer.current.setViewport(viewport.width, viewport.height, viewport.height <= 600);
      renderer.current.setPaused(state.presentationPaused, reduced); renderer.current.setActors(floating); setBytes(renderer.current.textureBytes);
    }
  }, [floating, viewport, state.presentationPaused, reduced]);
  useEffect(() => {
    let disposed = false;
    setStatuses({}); setFailed(false);
    if (reduced) return;
    void createCreatureRenderer(canvas.current!, (asset, value) => {
      if (!disposed) { setStatuses((current) => ({ ...current, [asset]: value })); setBytes(renderer.current?.textureBytes ?? 0); }
    }).then((instance) => {
      if (disposed) { instance.dispose(); return; }
      renderer.current = instance;
      const current = latest.current;
      instance.setViewport(current.viewport.width, current.viewport.height, current.viewport.height <= 600);
      instance.setPaused(current.paused, current.reduced); instance.setActors(current.actors);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; renderer.current?.dispose(); renderer.current = null; };
  }, [reduced]);
  const ready = !failed && floating.every((actor) => statuses[actor.asset] === 'ready') && roaming.every((actor) => native[actor.asset] === 'ready');
  const fallback = failed || floating.some((actor) => statuses[actor.asset] === 'fallback') || roaming.some((actor) => !inhabitants.attached || native[actor.asset] === 'fallback');
  const posters = roaming.filter(() => reduced || !inhabitants.attached);
  const background = getStageBackground(stage);
  const poster = (actor: (typeof actors)[number]) => <div key={actor.id} className="roaming-poster-anchor" data-phase={actor.phase} data-celebrated={actor.celebrated} data-edge={actor.edge} data-arrival={actor.arrival} data-departure={actor.departure} style={{ left: actor.left, top: actor.top, width: actor.width, height: actor.height, transform: actor.edge === 'top' ? 'rotate(180deg)' : undefined, ...roamingVariables(actor) } as import('react').CSSProperties}><img className="creature-poster" src={INHABITANT_ASSETS[actor.asset].poster} alt=""/></div>;
  const plate = (band: number) => <Fragment key={`plate-${band}`}><div className="roaming-foreground" style={{ transform: `translateY(${reduced ? 0 : parallax}px) scale(${BACKGROUND_RULES.overscan})` }}><img src={background?.hiding?.foreground.replace('hiding-foreground.webp', `hiding-band-${band}.webp`)} alt=""/></div>{background?.hiding?.lightBands?.includes(band) && <div className="roaming-foreground roaming-additive" style={{ transform: `translateY(${reduced ? 0 : parallax}px) scale(${BACKGROUND_RULES.overscan})` }}><img src={background.hiding.foreground.replace('hiding-foreground.webp', `hiding-light-${band}.webp`)} alt=""/></div>}</Fragment>;
  return <>
    {posters.length > 0 && <div className="roaming-fallback" data-paused={state.presentationPaused || reduced} aria-hidden="true">
      {plate(0)}
      {background?.hiding?.cuts.map((cut, index) => <span key={cut.id}>{posters.filter((actor) => actor.depth === cut.id).map(poster)}{plate(index + 1)}</span>)}
      {posters.filter((actor) => actor.depth === 'edge').map(poster)}
    </div>}
    <div className={`forest-inhabitants ${state.effects.includes('forest') ? 'is-enchanted' : ''}`} data-renderer={reduced ? 'static' : fallback ? 'fallback' : ready ? 'ready' : 'loading'} data-paused={state.presentationPaused || reduced} data-actor-count={actors.length} data-texture-bytes={reduced ? 0 : bytes + inhabitants.textureBytes}>
    <canvas key={reduced ? 'static' : 'dynamic'} ref={canvas} className="creature-canvas" aria-hidden="true"/>
    {actors.map((actor) => {
      const area = actor.hit ?? actor;
      const visual = reduced || failed || statuses[actor.asset] !== 'ready';
      const interactive = actor.kind === 'roaming' || actor.kind === 'fixed';
      const position = { left: area.left, top: area.top, width: area.width, height: area.height };
      return <div key={actor.id} className={`creature-anchor creature-${actor.kind}`} data-creature-id={actor.id} data-asset={actor.asset} data-phase={actor.phase} data-depth={actor.depth} data-edge={actor.edge} data-arrival={actor.arrival} data-departure={actor.departure} data-travel={actor.travel} data-celebrated={actor.celebrated} data-claimed={actor.claimed || undefined} style={{ ...position, pointerEvents: 'none' }}>
        {visual && actor.kind !== 'roaming' && <div className="creature-fallback-mask" aria-hidden="true"><img src={INHABITANT_ASSETS[actor.asset].poster} className="creature-poster" alt="" draggable="false" style={{ width: actor.width, height: actor.height, left: actor.left - area.left, top: actor.top - area.top }} onError={(event) => { event.currentTarget.hidden = true; }}/></div>}
        {interactive && <button className="creature-hit" aria-label="兰那罗" data-no-drag disabled={actor.phase === 'leaving' || actor.claimed || state.presentationPaused || state.mode === 'ending' || Boolean(state.reviewStage)} onClick={() => game.interactAranara(actor.encounter ?? actor.id, { x: (area.left + area.width / 2) / viewport.width * 100, y: (area.top + area.height / 2) / viewport.height * 100 })}/>}
      </div>;
    })}
  </div></>;
}
