"""Copy only referenced atlas rectangles; preserve pixels and packed rotations."""
import hashlib
import json
import math
from pathlib import Path
import sys
from PIL import Image


def pack(items, side):
    free = [(0, 0, side, side)]
    placed = []
    for item in sorted(items, key=lambda item: (-max(item['cropSize']), -math.prod(item['cropSize']), item['name'])):
        width, height = (value + 4 for value in item['cropSize'])
        candidates = [(min(fw-width, fh-height), max(fw-width, fh-height), y, x, index)
                      for index, (x, y, fw, fh) in enumerate(free) if fw >= width and fh >= height]
        if not candidates:
            return None
        _, _, y, x, _ = min(candidates)
        placed.append({**item, 'target': [x+2, y+2]})
        remaining = []
        for fx, fy, fw, fh in free:
            if x >= fx+fw or x+width <= fx or y >= fy+fh or y+height <= fy:
                remaining.append((fx, fy, fw, fh))
                continue
            if x > fx:
                remaining.append((fx, fy, x-fx, fh))
            if x+width < fx+fw:
                remaining.append((x+width, fy, fx+fw-x-width, fh))
            if y > fy:
                remaining.append((fx, fy, fw, y-fy))
            if y+height < fy+fh:
                remaining.append((fx, y+height, fw, fy+fh-y-height))
        free = [rect for index, rect in enumerate(remaining)
                if not any(other_index != index and other[0] <= rect[0] and other[1] <= rect[1]
                           and other[0]+other[2] >= rect[0]+rect[2] and other[1]+other[3] >= rect[1]+rect[3]
                           and (other != rect or other_index < index)
                           for other_index, other in enumerate(remaining))]
    return placed


def main():
    request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    cache = {}
    for asset in request['assets']:
        items = asset['regions']
        placed = None
        for side in [64, 128, 256, 512, 1024, 2048, 4096]:
            placed = pack(items, side)
            if placed is not None:
                break
        if placed is None:
            raise ValueError('Atlas did not fit: ' + asset['name'])
        atlas = Image.new('RGBA', (side, side))
        for item in placed:
            source = item['sourceFile']
            if source not in cache:
                cache[source] = Image.open(source).convert('RGBA')
            sx, sy = item['sourcePosition']
            width, height = item['cropSize']
            image = cache[source].crop((sx, sy, sx+width, sy+height))
            tx, ty = item['target']
            atlas.paste(image, (tx, ty))
            # Two pixels of edge extrusion keep linear sampling off neighbors.
            for dx in [-2, -1, width, width+1]:
                atlas.paste(image.crop((0 if dx < 0 else width-1, 0, 1 if dx < 0 else width, height)), (tx+dx, ty))
            for dy in [-2, -1, height, height+1]:
                atlas.paste(atlas.crop((tx-2, ty if dy < 0 else ty+height-1, tx+width+2, ty+1 if dy < 0 else ty+height)), (tx-2, ty+dy))
            if atlas.crop((tx, ty, tx+width, ty+height)).tobytes() != image.tobytes():
                raise ValueError('Pixel copy mismatch')
            item['pixelSha256'] = hashlib.sha256(image.tobytes()).hexdigest()
        destination = Path(asset['directory'])
        atlas.save(destination / (asset['name'] + '.png'), optimize=True)
        lines = [asset['name']+'.png', f'size:{side},{side}', 'format:RGBA8888', 'filter:Linear,Linear', 'repeat:none', 'pma:false']
        for item in placed:
            tx, ty = item['target']
            width, height = item['logicalSize']
            lines.extend([item['name'], f'bounds:{tx},{ty},{width},{height}', 'offsets:'+','.join(map(str, item['offsets']))])
            if item['degrees']:
                lines.append('rotate:'+str(item['degrees']))
        (destination / (asset['name']+'.atlas')).write_text('\n'.join(lines)+'\n', encoding='utf-8')
        asset['atlasSize'] = [side, side]
        asset['regions'] = placed
    Path(sys.argv[2]).write_text(json.dumps(request, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
