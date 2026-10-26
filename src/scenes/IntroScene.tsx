import { BACKGROUND_ASSETS } from '../data/assets';
import { Icon } from '../components/Icon';
import { BackgroundBase } from '../components/BackgroundBase';
import { BACKGROUND_RULES } from '../game/backgrounds/policy';
import { BuildMarker } from '../components/BuildMarker';
import { SEED_ART } from '../data/seed';

export function IntroScene({ onEnter, onSettings, onNotice, message, unplanted = false, testing = false }: { onEnter: () => void; onSettings?: () => void; onNotice?: () => void; message?: string; unplanted?: boolean; testing?: boolean }) {
  return <main className="intro-scene">
    <div className="background-parallax" style={{ transform: `scale(${BACKGROUND_RULES.overscan})` }} aria-hidden="true"><BackgroundBase asset={BACKGROUND_ASSETS.forest} intro/></div>
    <header className="intro-brand"><Icon name="leaf" size={24}/><span><span>浇灌一棵世界树</span><BuildMarker testing={testing}/></span></header>
    {onNotice && <button className="icon-button intro-settings intro-notice-button" onClick={onNotice} aria-label="公告与声明" title="公告与声明" data-notice-opener><Icon name="notice"/></button>}
    {onSettings && <button className="icon-button intro-settings" onClick={onSettings} aria-label="设置" title="设置" data-panel-opener><Icon name="settings"/></button>}
    <div className="intro-content">
      <div className="intro-emblem" aria-hidden="true"><Icon name="leaf" size={62}/></div>
      <div className="eyebrow">A DREAM BEFORE HER BIRTHDAY</div>
      <h1>有一颗种子，<br/>在你的梦里醒来。</h1>
      <p className="intro-invitation">植物的生长，需要水，需要风，需要养料与阳光。<br/>梦景的天成，源于形，源于声，源于喧嚣与幽思。</p>
      <button className="primary-button enter-dream" onClick={onEnter}>沉入梦乡 <Icon name="arrow" size={20}/></button>
      {unplanted && <div className="intro-seed" aria-hidden="true"><img src={SEED_ART.src} alt="" draggable={false}/></div>}
    </div>
    {message && <div className="intro-notice" role="status">{message}</div>}
    <footer className="intro-footer"><span>10.27 · 献给纳西妲</span><span>非商业同人生贺企划 · 不代表任何官方立场</span></footer>
  </main>;
}
