import { PROCEDURAL_LEAF, proceduralTree, proceduralTrunkPath } from '../game/tree/procedural';

export function ProceduralTreeArt({ growth, seed, prefix, flowering }: { growth: number; seed: number; prefix: string; flowering: boolean }) {
  const tree = proceduralTree(growth, seed);
  if (!tree.height) return null;
  return <g className="procedural-tree-art" data-procedural-height={tree.height}>
    <defs>
      <linearGradient id={`${prefix}-bark`} x1="0" x2="1"><stop stopColor="#46634b"/><stop offset=".38" stopColor="#abc586"/><stop offset=".6" stopColor="#70976b"/><stop offset="1" stopColor="#304e42"/></linearGradient>
      <linearGradient id={`${prefix}-leaf`} x2=".8" y2="1"><stop stopColor="#e6efad"/><stop offset=".4" stopColor="#a8ce7c"/><stop offset="1" stopColor="#3b8f69"/></linearGradient>
      <path id={`${prefix}-leaf-shape`} d={PROCEDURAL_LEAF} fill={`url(#${prefix}-leaf)`}/>
    </defs>
    <g className="procedural-roots" stroke={`url(#${prefix}-bark)`} strokeWidth={5 + Math.min(17, tree.height / 120)} fill="none" strokeLinecap="round"><path d="M500 3295Q460 3328 405 3331M498 3300Q522 3334 580 3336M496 3300Q470 3347 453 3352M510 3300Q532 3314 542 3344"/></g>
    <path className="tree-hit-target" d={proceduralTrunkPath(tree.height)} fill={`url(#${prefix}-bark)`}/>
    <path d={`M500 3300Q480 ${3300 - tree.height * .45} ${tree.crownX} ${tree.crownY}`} fill="none" stroke="#e3e7af" strokeWidth="2" opacity=".4" pointerEvents="none"/>
    {tree.branches.map((branch) => <g key={branch.id} data-procedural-branch={branch.id}>
      <path d={branch.path} fill="none" stroke={branch.historical === 'freedom' ? '#d0cf8a' : `url(#${prefix}-bark)`} strokeWidth={Math.max(3, 9 - branch.elevation / 700)} strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - branch.emergence}/>
      {branch.leaves.filter((leaf) => leaf.scale > .01).map((leaf) => <use key={leaf.id} data-procedural-leaf={leaf.id} href={`#${prefix}-leaf-shape`} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.scale})`}/>)}
      {branch.historical === 'first-leaf' && branch.emergence === 1 && <path d={`M${branch.endX} ${branch.endY}q-24-4-17-28q28 1 17 28Z`} fill="#e6df94"/>}
      {branch.historical === 'freedom' && branch.emergence === 1 && <g stroke="#e7dda5" strokeWidth="1" fill="none"><circle cx={branch.endX} cy={branch.endY + 22} r="13"/><path d={`M${branch.endX} ${branch.endY}v38`}/></g>}
    </g>)}
    <g className="procedural-crown">{tree.crown.map((leaf) => <g key={leaf.id}>
      <path d={`M${tree.crownX} ${tree.crownY + 90}Q${leaf.x} ${tree.crownY + 65} ${leaf.x} ${leaf.y}`} fill="none" stroke="#86ac71" strokeWidth="3"/>
      <use href={`#${prefix}-leaf-shape`} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.scale})`}/>
      {flowering && leaf.flowering && <g transform={`translate(${leaf.x} ${leaf.y - 30})`}>{[0, 72, 144, 216, 288].map((angle) => <ellipse key={angle} cy="-6" rx="4" ry="6" transform={`rotate(${angle})`} fill="#f1dece"/>)}<circle r="3" fill="#ffeab0"/></g>}
    </g>)}</g>
  </g>;
}
