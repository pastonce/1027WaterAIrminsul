"""Check saved repacked PNG rectangles against the retained source atlases."""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
report = json.loads((root / 'docs/player-extracted/texture-packing.json').read_text(encoding='utf-8'))
cache = {}
count = 0
for asset in report['assets']:
    destination = Image.open(Path(asset['directory']) / (asset['name'] + '.png')).convert('RGBA')
    for region in asset['regions']:
        source_file = region['sourceFile']
        if source_file not in cache:
            cache[source_file] = Image.open(source_file).convert('RGBA')
        sx, sy = region['sourcePosition']
        tx, ty = region['target']
        width, height = region['cropSize']
        original = cache[source_file].crop((sx, sy, sx+width, sy+height)).tobytes()
        extracted = destination.crop((tx, ty, tx+width, ty+height)).tobytes()
        assert original == extracted, region['name']
        assert hashlib.sha256(extracted).hexdigest() == region['pixelSha256'], region['name']
        count += 1
print(f'{count} packed regions are pixel-identical to the retained source textures.')
