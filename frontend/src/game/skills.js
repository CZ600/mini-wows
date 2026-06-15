/** 客户端技能状态机（仅单机模式使用；联机模式由服务器 snapshot 驱动）。 */

const SKILL_CONFIG = {
  rapid_fire:      { duration: 10.0, cooldown: 80.0, fireCooldownMult: 0.7 },
  damage_control:  { duration: 10.0, cooldown: 40.0, hpRegenRatio: 0.3 },
  precision:       { duration: 10.0, cooldown: 60.0, spreadMult: 0.7 },
};

const SKILL_NAMES = ['rapid_fire', 'damage_control', 'precision'];

export class ShipSkills {
  constructor() {
    this.activeRemain = { rapid_fire: 0, damage_control: 0, precision: 0 };
    this.cooldownRemain = { rapid_fire: 0, damage_control: 0, precision: 0 };
    this._dcAccumulated = 0;
    this._dcCap = 0;
  }

  isActive(name) { return this.activeRemain[name] > 0; }

  canActivate(name) {
    if (!SKILL_CONFIG[name]) return false;
    if (this.activeRemain[name] > 0) return false;
    if (this.cooldownRemain[name] > 0) return false;
    return true;
  }

  activate(name, ship) {
    if (!this.canActivate(name)) return false;
    const cfg = SKILL_CONFIG[name];
    this.activeRemain[name] = cfg.duration;
    this.cooldownRemain[name] = cfg.cooldown;

    if (name === 'rapid_fire') {
      const mult = cfg.fireCooldownMult;
      for (const t of ship.turrets) {
        if (t.cooldown > 0) t.cooldown *= mult;
      }
    } else if (name === 'damage_control') {
      this._dcAccumulated = 0;
      this._dcCap = ship.maxHp * cfg.hpRegenRatio;
    }
    return true;
  }

  update(dt, ship) {
    for (const name of SKILL_NAMES) {
      const prev = this.activeRemain[name];
      if (prev > 0) this.activeRemain[name] = Math.max(0, prev - dt);
      if (this.cooldownRemain[name] > 0) this.cooldownRemain[name] = Math.max(0, this.cooldownRemain[name] - dt);

      if (name === 'damage_control') {
        const activeTime = prev > 0 ? Math.min(prev, dt) : 0;
        if (activeTime > 0 && ship.alive) {
          const cfg = SKILL_CONFIG.damage_control;
          const remaining = this._dcCap - this._dcAccumulated;
          if (remaining > 1e-6) {
            const rate = this._dcCap / cfg.duration;
            const heal = Math.min(rate * activeTime, remaining);
            ship.hp = Math.min(ship.maxHp, ship.hp + heal);
            this._dcAccumulated += heal;
          }
        }
      }
    }
  }

  reset() {
    for (const name of SKILL_NAMES) {
      this.activeRemain[name] = 0;
      this.cooldownRemain[name] = 0;
    }
    this._dcAccumulated = 0;
    this._dcCap = 0;
  }

  toSnapshot() {
    return {
      rf: { a: Math.round(this.activeRemain.rapid_fire * 100) / 100, c: Math.round(this.cooldownRemain.rapid_fire * 100) / 100 },
      dc: { a: Math.round(this.activeRemain.damage_control * 100) / 100, c: Math.round(this.cooldownRemain.damage_control * 100) / 100 },
      ps: { a: Math.round(this.activeRemain.precision * 100) / 100, c: Math.round(this.cooldownRemain.precision * 100) / 100 },
    };
  }

  static getConfig(name) { return SKILL_CONFIG[name]; }
}
