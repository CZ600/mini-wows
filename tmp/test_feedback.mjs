// Simulate the damage feedback pipeline in isolation (mirrors engine.js logic)
let emitted = [];
let dmgAccum = 0;
let lastEmit = 0;

const cb = (amount) => { dmgAccum += amount; };

function takeDamage(amount) { if (cb) cb(amount); }

function flush(now) {
  if (dmgAccum <= 0) return false;
  if (now - lastEmit < 100) return false;
  emitted.push({ type: 'damage', amount: Math.round(dmgAccum) });
  dmgAccum = 0;
  lastEmit = now;
  return true;
}

// 3-barrel salvo at t=1000
takeDamage(50); takeDamage(50); takeDamage(50);
flush(1000);
// next hits at t=1050 (within throttle window)
takeDamage(40); takeDamage(40);
flush(1050);
// at t=1200 (past window)
flush(1200);

console.log('Emitted:', JSON.stringify(emitted));
console.log('Expected: [{type:damage,amount:150},{type:damage,amount:80}]');
