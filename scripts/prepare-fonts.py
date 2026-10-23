from hashlib import sha256
import json
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


root = Path(__file__).resolve().parents[1]
source = root / 'asserts/字体/原神0.87.ttf'
font = TTFont(source)
supported = set(font.getBestCmap())
common = set(range(0x20, 0x7F))
inputs = sorted(path for path in (root / 'src').rglob('*') if path.suffix in {'.ts', '.tsx', '.json', '.css', '.md'}) + [root / 'index.html']
for file in inputs:
    common.update(map(ord, file.read_text(encoding='utf-8')))
common &= supported
remaining = supported - common
output = root / 'public/asserts/fonts'
output.mkdir(parents=True, exist_ok=True)
manifest = {'version': 1, 'source': source.relative_to(root).as_posix(), 'sourceSha256': sha256(source.read_bytes()).hexdigest(), 'sourceBytes': source.stat().st_size, 'family': font['name'].getDebugName(1), 'glyphs': len(supported), 'files': []}


def unicode_ranges(characters):
    ranges = []
    start = previous = None
    for character in sorted(characters):
        if start is not None and character != previous + 1:
            ranges.append((start, previous))
            start = character
        if start is None:
            start = character
        previous = character
    if start is not None:
        ranges.append((start, previous))
    return ','.join(f'U+{start:X}' if start == end else f'U+{start:X}-{end:X}' for start, end in ranges)


rules = []
for name, characters in [('common', common), ('extended', remaining)]:
    derived = TTFont(source)
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.recalc_timestamp = False
    processor = subset.Subsetter(options=options)
    processor.populate(unicodes=characters)
    processor.subset(derived)
    derived.flavor = 'woff2'
    temporary = output / f'.{name}.woff2'
    derived.save(temporary)
    payload = temporary.read_bytes()
    digest = sha256(payload).hexdigest()
    target = output / f'irminsul-{name}-{digest[:12]}.woff2'
    target.write_bytes(payload)
    temporary.unlink()
    restored = TTFont(target)
    if set(restored.getBestCmap()) != characters:
        raise ValueError(f'Incomplete font coverage: {name}')
    src = f'/asserts/fonts/{target.name}'
    manifest['files'].append({'kind': name, 'file': target.relative_to(root).as_posix(), 'src': src, 'bytes': len(payload), 'sha256': digest, 'characters': len(characters), 'unicodeRange': unicode_ranges(characters)})
    range_rule = f';unicode-range:{unicode_ranges(characters)}' if name == 'extended' else ''
    rules.append(f'@font-face{{font-family:"Irminsul";src:url("{src}") format("woff2");font-weight:400;font-style:normal;font-display:swap{range_rule}}}')
(root / 'src/styles/fonts.css').write_text('\n'.join(rules) + '\n', encoding='utf-8')
(root / 'src/data/fonts.generated.json').write_text(json.dumps({'common': manifest['files'][0]['src'], 'extended': manifest['files'][1]['src']}, indent=2) + '\n', encoding='utf-8')
(root / 'docs/font-assets.manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'sourceBytes': manifest['sourceBytes'], 'glyphs': len(supported), 'commonBytes': manifest['files'][0]['bytes'], 'extendedBytes': manifest['files'][1]['bytes']}, ensure_ascii=False))
