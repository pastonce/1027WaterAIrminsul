import { PUBLIC_TESTING } from '../data/build';
export function BuildMarker() { return PUBLIC_TESTING ? <span className="build-marker">（开发测试中）</span> : null; }
