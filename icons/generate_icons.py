import zlib
import struct
import math

def create_png(width, height, draw_func, filename):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = draw_func(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    # Compress IDAT
    compressed = zlib.compress(bytes(raw_data), 9)
    
    # PNG signature
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    
    # IHDR chunk
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png.extend(struct.pack('>I', len(ihdr)) + b'IHDR' + ihdr + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr)))
    
    # IDAT chunk
    png.extend(struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', zlib.crc32(b'IDAT' + compressed)))
    
    # IEND chunk
    png.extend(struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND')))
    
    with open(filename, 'wb') as f:
        f.write(png)

def icon_drawer(x, y, w, h):
    nx = (x / (w - 1)) * 2.0 - 1.0  # -1 to 1
    ny = (y / (h - 1)) * 2.0 - 1.0  # -1 to 1
    dist = math.sqrt(nx*nx + ny*ny)
    
    # Outer circle / shield shape
    if dist > 0.95:
        return (0, 0, 0, 0)
    
    # Gold border
    if dist > 0.82:
        return (212, 175, 55, 255)
    
    # Dark obsidian background
    bg_r = int(15 + (1.0 - dist) * 20)
    bg_g = int(20 + (1.0 - dist) * 25)
    bg_b = int(35 + (1.0 - dist) * 40)
    
    # Crossed sword lines (|nx - ny| < 0.15 or |nx + ny| < 0.15)
    diag1 = abs(nx - ny)
    diag2 = abs(nx + ny)
    if (diag1 < 0.12 or diag2 < 0.12) and dist < 0.78:
        # Silver / Gold blade
        return (241, 196, 15, 255)
    
    # Central glowing red orb
    if dist < 0.35:
        orb_factor = 1.0 - (dist / 0.35)
        r = min(255, int(231 + orb_factor * 24))
        g = min(255, int(76 * (1.0 - orb_factor) + 200 * orb_factor))
        b = min(255, int(60 * (1.0 - orb_factor) + 50 * orb_factor))
        return (r, g, b, 255)
        
    return (bg_r, bg_g, bg_b, 255)

for size in [16, 48, 128]:
    create_png(size, size, icon_drawer, f'c:/Users/Administrator/Desktop/blackbox/jadesrobot/icons/icon{size}.png')

print("All PNG icons created successfully!")
