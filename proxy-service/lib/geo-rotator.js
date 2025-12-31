class GeoRotator {
  constructor(options = {}) {
    this.pool = Array.isArray(options.pool) ? options.pool : [];
    this.strategy = options.strategy || 'weighted';
    this.weights = options.weights || null;
    this.index = 0;
  }

  normalize(code) {
    if (!code || typeof code !== 'string') return null;
    const trimmed = code.trim();
    if (trimmed.length !== 2) return null;
    return trimmed.toLowerCase();
  }

  sanitizedPool() {
    return this.pool
      .map((c) => this.normalize(c))
      .filter(Boolean);
  }

  next() {
    const pool = this.sanitizedPool();
    if (!pool.length) return null;

    if (this.strategy === 'random') {
      return pool[Math.floor(Math.random() * pool.length)];
    }

    if (this.strategy === 'round_robin') {
      const val = pool[this.index % pool.length];
      this.index = (this.index + 1) % pool.length;
      return val;
    }

    // Weighted (default)
    const weights = this.weights || {};
    const normalized = pool.map((c) => ({ code: c, weight: Number(weights[c.toUpperCase()]) || Number(weights[c]) || 1 }));
    const total = normalized.reduce((sum, item) => sum + (item.weight > 0 ? item.weight : 0), 0);
    if (total <= 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    let r = Math.random() * total;
    for (const item of normalized) {
      const w = item.weight > 0 ? item.weight : 0;
      if (r < w) return item.code;
      r -= w;
    }
    return pool[pool.length - 1];
  }
}

module.exports = GeoRotator;
