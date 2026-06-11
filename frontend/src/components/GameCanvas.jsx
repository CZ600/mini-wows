import { useEffect, useRef } from 'react';

export default function GameCanvas({ engine }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && engine) {
      engine.init(canvasRef.current);
    }
    return () => {
      // engine cleanup handled by parent
    };
  }, [engine]);

  return <canvas ref={canvasRef} id="game-canvas" />;
}
