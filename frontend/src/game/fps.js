// Smoothed frame-rate tracking shared by every render loop.
// rAF timestamps occasionally repeat (dropped/coalesced frames) or a
// duplicated render loop double-steps a frame: dt = 0, or NaN in environments
// that invoke rAF callbacks without a timestamp. Fed into a naive EMA,
// 1/0 = Infinity and the next step Infinity - Infinity = NaN — which then
// poisons the average permanently, so the HUD renders "0" forever. Guard
// degenerate samples and self-heal a non-finite average instead.
export function updateFpsEMA(prevFps, dt, alpha = 0.05) {
  if (!Number.isFinite(prevFps)) prevFps = 60;
  // Sub-millisecond frames are degenerate (duplicate timestamp / overstep);
  // skip them rather than folding a 1000+ fps sample into the average.
  if (Number.isFinite(dt) && dt >= 0.001) {
    prevFps += (1 / dt - prevFps) * alpha;
  }
  return Number.isFinite(prevFps) ? prevFps : 60;
}
