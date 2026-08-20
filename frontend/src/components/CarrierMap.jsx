import { useRef, useEffect, useState, useCallback } from 'react';

// Full-screen carrier patrol map. Shows the whole battlefield (terrain +
// carrier + enemies) and lets the player click to lay down a closed-loop patrol
// path. Enter confirms (carrier autopilots the loop), Esc/M cancels.
//
// Props:
//   terrainImage   - HTMLCanvasElement/Image from Terrain.generateMinimapImage()
//   carrierPos     - {x, z} of the carrier (world coords, ±MAP_HALF)
//   carrierHeading - rad
//   enemies        - [{x,z}] alive enemy positions (world coords)
//   onConfirm      - (points: [{x,z}, ...]) => void  — sets the patrol loop
//   onClose        - () => void                       — close without confirming
//
// World coords: x∈[-5000,5000] right(+), z∈[-5000,5000] down(+). The map image
// is drawn with +x right and +z down, matching the minimap convention.
const MAP_SIZE = 10000;   // world units across
const MAP_HALF = MAP_SIZE / 2;

export default function CarrierMap({ terrainImage, carrierPos, carrierHeading, enemies, onConfirm, onClose }) {
  const canvasRef = useRef(null);
  const [points, setPoints] = useState([]);

  // Convert a world point to canvas pixel coords given the canvas size.
  const worldToCanvas = useCallback((p, w, h) => ({
    x: ((p.x + MAP_HALF) / MAP_SIZE) * w,
    y: ((p.z + MAP_HALF) / MAP_SIZE) * h,
  }), []);

  const canvasToWworld = useCallback((cx, cy, w, h) => ({
    x: (cx / w) * MAP_SIZE - MAP_HALF,
    z: (cy / h) * MAP_SIZE - MAP_HALF,
  }), []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Terrain background.
    if (terrainImage) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrainImage, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#0a3a6a';
      ctx.fillRect(0, 0, w, h);
    }

    // Enemies (red dots).
    if (enemies) {
      ctx.fillStyle = '#ff4444';
      for (const e of enemies) {
        if (!e) continue;
        const c = worldToCanvas(e, w, h);
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Patrol path so far (polyline + dots), closed if 2+ points.
    if (points.length > 0) {
      ctx.strokeStyle = '#6ec8ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const first = worldToCanvas(points[0], w, h);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        const c = worldToCanvas(points[i], w, h);
        ctx.lineTo(c.x, c.y);
      }
      if (points.length >= 2) {
        // Close the loop back to the start.
        ctx.lineTo(first.x, first.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#6ec8ff';
      for (let i = 0; i < points.length; i++) {
        const c = worldToCanvas(points[i], w, h);
        ctx.beginPath();
        ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), c.x, c.y);
        ctx.fillStyle = '#6ec8ff';
      }
    }

    // Carrier marker (blue triangle, rotated to heading).
    if (carrierPos) {
      const c = worldToCanvas(carrierPos, w, h);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(Math.PI - (carrierHeading || 0));
      ctx.fillStyle = '#44ff44';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(-6, 7);
      ctx.lineTo(6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }, [terrainImage, enemies, points, carrierPos, carrierHeading, worldToCanvas]);

  useEffect(() => {
    let id;
    const loop = () => { draw(); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [draw]);

  // Resize canvas to fill its container on mount + window resize.
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const wrap = canvas.parentElement;
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Esc cancels, Enter confirms.
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'm') {
        e.preventDefault();
        onClose();
      } else if (k === 'enter') {
        e.preventDefault();
        if (points.length >= 2) onConfirm(points);
      } else if (k === 'z') {
        // Undo last waypoint.
        e.preventDefault();
        setPoints((ps) => ps.slice(0, -1));
      } else if (k === 'c') {
        e.preventDefault();
        setPoints([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [points, onConfirm, onClose]);

  const onClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const wp = canvasToWworld(cx, cy, canvas.width, canvas.height);
    setPoints((ps) => [...ps, wp]);
  };

  return (
    <div id="carrier-map-overlay">
      <div id="carrier-map-canvas-wrap">
        <canvas ref={canvasRef} onClick={onClick} />
      </div>
      <div id="carrier-map-toolbar">
        <div className="cm-title">航母巡航路径规划</div>
        <div className="cm-hint">
          左键点击添加航点（{points.length} 个） · <b>Enter</b> 确认 · <b>Z</b> 撤销 · <b>C</b> 清空 · <b>Esc/M</b> 关闭
        </div>
        <div className="cm-buttons">
          <button
            className="cm-btn cm-confirm"
            disabled={points.length < 2}
            onClick={() => onConfirm(points)}
          >
            确认巡航 ({points.length})
          </button>
          <button className="cm-btn cm-undo" onClick={() => setPoints((ps) => ps.slice(0, -1))} disabled={points.length === 0}>
            撤销
          </button>
          <button className="cm-btn cm-clear" onClick={() => setPoints([])} disabled={points.length === 0}>
            清空
          </button>
          <button className="cm-btn cm-cancel" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
