import { useEffect, useRef } from 'react';

export default function GameCanvas({ engine, onInit }) {
  const canvasRef = useRef(null);
  const initDone = useRef(false);

  useEffect(() => {
    if (canvasRef.current && engine && !initDone.current) {
      initDone.current = true;
      engine.init(canvasRef.current);
      if (onInit) onInit();
    }
  });

  return <canvas ref={canvasRef} id="game-canvas" />;
}
