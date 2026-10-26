export function BuildMarker({ testing = false }: { testing?: boolean }) { return testing ? <span className="build-marker">（开发测试中）</span> : null; }
