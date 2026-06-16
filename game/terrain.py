import math
import random
from game.config import MAP_SIZE, MAP_HALF, TERRAIN_SEGMENTS, TERRAIN_NOISE_SEED, ISLAND_COUNT


class PerlinNoise:
    def __init__(self, seed=42):
        p = list(range(256))
        s = seed
        for i in range(255, 0, -1):
            s = (s * 16807) % 2147483647
            j = s % (i + 1)
            p[i], p[j] = p[j], p[i]
        self.perm = p * 2

    @staticmethod
    def _fade(t):
        return t * t * t * (t * (t * 6 - 15) + 10)

    @staticmethod
    def _lerp(a, b, t):
        return a + t * (b - a)

    @staticmethod
    def _grad(h, x, y):
        h2 = h & 3
        u = x if h2 < 2 else y
        v = y if h2 < 2 else x
        return (-u if h2 & 1 else u) + (-v if h2 & 2 else v)

    def noise(self, x, y):
        X = int(math.floor(x)) & 255
        Y = int(math.floor(y)) & 255
        xf = x - math.floor(x)
        yf = y - math.floor(y)
        u = self._fade(xf)
        v = self._fade(yf)
        p = self.perm
        aa = p[p[X] + Y]
        ab = p[p[X] + Y + 1]
        ba = p[p[X + 1] + Y]
        bb = p[p[X + 1] + Y + 1]
        return self._lerp(
            self._lerp(self._grad(aa, xf, yf), self._grad(ba, xf - 1, yf), u),
            self._lerp(self._grad(ab, xf, yf - 1), self._grad(bb, xf - 1, yf - 1), u),
            v,
        )

    def fbm(self, x, y, octaves=4, lacunarity=2, gain=0.5):
        total = 0.0
        amp = 1.0
        freq = 1.0
        mx = 0.0
        for _ in range(octaves):
            total += self.noise(x * freq, y * freq) * amp
            mx += amp
            amp *= gain
            freq *= lacunarity
        return total / mx


def generate_islands(seed):
    rng = random.Random(seed)
    islands = []
    for _ in range(ISLAND_COUNT):
        # 与单机 (frontend/src/game/terrain.js) 完全一致的参数与随机顺序:
        # height -> radius -> x -> z
        # 最高高度提升至原来的 300%（最大值 60 -> 180），范围 20~200
        height = 20 + rng.random() * 180
        # 底座面积随高度放大：高山配更宽的底座，避免尖塔感
        # 矮山(height≈20):  约 300~500；高山(height≈200): 约 800~1000
        radius = 300 + (height / 200) * 500 + rng.random() * 200
        islands.append({
            "x": (rng.random() - 0.5) * MAP_SIZE * 0.7,
            "z": (rng.random() - 0.5) * MAP_SIZE * 0.7,
            "radius": radius,
            "height": height,
        })
    return islands


class Terrain:
    def __init__(self, seed=None, islands=None):
        self.seed = seed or 0
        self.islands = islands if islands is not None else generate_islands(self.seed)
        self.noise = PerlinNoise(TERRAIN_NOISE_SEED)
        seg = TERRAIN_SEGMENTS
        self.heights = [0.0] * ((seg + 1) * (seg + 1))

        step = MAP_SIZE / seg
        for iz in range(seg + 1):
            for ix in range(seg + 1):
                x = -MAP_HALF + ix * step
                z = -MAP_HALF + iz * step
                h = self.noise.fbm(x * 0.0003, z * 0.0003, 4) * 3 - 3
                for island in self.islands:
                    dx = x - island["x"]
                    dz = z - island["z"]
                    dist = math.sqrt(dx * dx + dz * dz)
                    if dist < island["radius"]:
                        factor = 1 - dist / island["radius"]
                        h += island["height"] * factor * factor
                if h < 0:
                    h = -4
                else:
                    h += 2
                self.heights[iz * (seg + 1) + ix] = h

    def get_height_at(self, x, z):
        seg = TERRAIN_SEGMENTS
        half = MAP_HALF
        step = MAP_SIZE / seg
        ix = (x + half) / step
        iz = (z + half) / step
        x0 = int(math.floor(ix))
        z0 = int(math.floor(iz))
        fx = ix - x0
        fz = iz - z0
        if x0 < 0 or x0 >= seg or z0 < 0 or z0 >= seg:
            return -5.0

        def idx(xi, zi):
            return zi * (seg + 1) + xi

        h00 = self.heights[idx(x0, z0)]
        h10 = self.heights[idx(x0 + 1, z0)]
        h01 = self.heights[idx(x0, z0 + 1)]
        h11 = self.heights[idx(x0 + 1, z0 + 1)]
        return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz - 1

    def is_land(self, x, z):
        return self.get_height_at(x, z) > 0
