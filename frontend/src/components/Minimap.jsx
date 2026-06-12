import { useRef, useEffect, useCallback } from 'react';

const SIZE = 200;
const VIEW_RANGE = 2000;
const MAP_SIZE = 10000;

export default function Minimap({ data }) {
  const canvasRef = useRef(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const d = dataRef.current;
    if (!d) return;

    ctx.clearRect(0, 0, SIZE, SIZE);

    if (d.terrainImage) {
      const imgRes = d.terrainImage.width;
      const srcSize = (VIEW_RANGE / MAP_SIZE) * imgRes;
      const srcX = ((d.playerPos.x + MAP_SIZE / 2) / MAP_SIZE) * imgRes - srcSize / 2;
      const srcY = ((d.playerPos.z + MAP_SIZE / 2) / MAP_SIZE) * imgRes - srcSize / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(d.terrainImage, srcX, srcY, srcSize, srcSize, 0, 0, SIZE, SIZE);
    } else {
      ctx.fillStyle = '#0a3a6a';
      ctx.fillRect(0, 0, SIZE, SIZE);
    }

    const scale = SIZE / VIEW_RANGE;

    if (d.enemies) {
      for (const enemy of d.enemies) {
        if (!enemy.alive) continue;
        const ex = (enemy.mesh.position.x - d.playerPos.x) * scale + SIZE / 2;
        const ez = (enemy.mesh.position.z - d.playerPos.z) * scale + SIZE / 2;
        if (ex < 0 || ex > SIZE || ez < 0 || ez > SIZE) continue;
        if (enemy.type === 'ship') {
          ctx.save();
          ctx.translate(ex, ez);
          const shipHeading = enemy.heading || 0;
          ctx.rotate(Math.PI - shipHeading);
          ctx.fillStyle = '#ff3333';
          ctx.beginPath();
          ctx.moveTo(0, -5);
          ctx.lineTo(-3, 4);
          ctx.lineTo(3, 4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = '#ff3333';
          ctx.beginPath();
          ctx.arc(ex, ez, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(Math.PI - d.playerHeading);
    ctx.fillStyle = '#44ff44';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, SIZE, SIZE);
  }, []);

  useEffect(() => {
    let id;
    const loop = () => { draw(); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [draw]);

  return <canvas ref={canvasRef} id="minimap" width={SIZE} height={SIZE} />;
}
