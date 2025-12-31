/**
 * User-Agent Rotation Module
 * Provides realistic browser UAs with matching headers per geo/device
 */

const UA_POOL = {
  desktop: {
    us: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
    ],
    in: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ],
    uk: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  },
  mobile: {
    us: [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    ],
    in: [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    ],
    uk: [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
    ]
  }
};

const ACCEPT_LANGUAGE = {
  us: 'en-US,en;q=0.9',
  in: 'en-IN,en-US;q=0.9,en;q=0.8',
  uk: 'en-GB,en-US;q=0.9,en;q=0.8',
  de: 'de-DE,de;q=0.9,en;q=0.8',
  fr: 'fr-FR,fr;q=0.9,en;q=0.8',
  default: 'en-US,en;q=0.9'
};

class UARotation {
  constructor(profile = 'desktop', geo = 'us', strategy = 'random') {
    this.profile = profile;
    this.geo = geo;
    this.strategy = strategy;
    this.index = 0;
  }

  getUA() {
    const pool = UA_POOL[this.profile]?.[this.geo] || UA_POOL[this.profile]?.us || UA_POOL.desktop.us;
    
    if (this.strategy === 'random') {
      return pool[Math.floor(Math.random() * pool.length)];
    } else if (this.strategy === 'round-robin') {
      const ua = pool[this.index % pool.length];
      this.index++;
      return ua;
    }
    return pool[0];
  }

  getHeaders(customUA = null) {
    const ua = customUA || this.getUA();
    const lang = ACCEPT_LANGUAGE[this.geo] || ACCEPT_LANGUAGE.default;
    
    return {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': lang,
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Pragma': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    };
  }
}

module.exports = UARotation;
