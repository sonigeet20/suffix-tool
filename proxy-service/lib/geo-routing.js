/**
 * Geo-Routing Module
 * Handles proxy configuration for multiple providers with geo-targeting
 */

class GeoRouting {
  constructor(provider, credentials, defaultRegion = 'us') {
    this.provider = provider.toLowerCase();
    this.credentials = credentials;
    this.defaultRegion = defaultRegion;
  }

  /**
   * Build proxy URL for the specified region
   * @param {string} region - Two-letter country code (us, in, uk, de, etc.)
   * @returns {string} Proxy URL
   */
  getProxyUrl(region = null) {
    const targetRegion = region || this.defaultRegion;
    
    switch (this.provider) {
      case 'luna':
        return this.buildLunaProxy(targetRegion);
      case 'bright':
      case 'brightdata':
        return this.buildBrightProxy(targetRegion);
      case 'oxylabs':
        return this.buildOxylabsProxy(targetRegion);
      case 'smartproxy':
        return this.buildSmartProxy(targetRegion);
      default:
        return this.credentials.url || this.credentials;
    }
  }

  buildLunaProxy(region) {
    const { username, password, host, port } = this.parseCredentials();
    // Luna format: user-static_XXX-region-us-sessid-xxx-sesstime-90
    const baseUser = username.split('-region-')[0];
    const sessionParts = username.match(/-(sessid-[^-]+-sesstime-\d+)$/);
    const sessionSuffix = sessionParts ? `-${sessionParts[1]}` : '';
    const geoUser = `${baseUser}-region-${region}${sessionSuffix}`;
    return `http://${geoUser}:${password}@${host}:${port}`;
  }

  buildBrightProxy(region) {
    const { username, password, host, port } = this.parseCredentials();
    // Bright format: auth-customer-country-us-sessionid-xxx
    const baseUser = username.split('-country-')[0];
    const sessionParts = username.match(/-(sessionid-[^-]+)$/);
    const sessionSuffix = sessionParts ? `-${sessionParts[1]}` : '';
    const geoUser = `${baseUser}-country-${region}${sessionSuffix}`;
    return `http://${geoUser}:${password}@${host}:${port}`;
  }

  buildOxylabsProxy(region) {
    const { username, password, host, port } = this.parseCredentials();
    // Oxylabs format: customer-xxx-cc-us-sessid-xxx
    const baseUser = username.split('-cc-')[0];
    const geoUser = `${baseUser}-cc-${region}`;
    return `http://${geoUser}:${password}@${host}:${port}`;
  }

  buildSmartProxy(region) {
    const { username, password, host, port } = this.parseCredentials();
    // SmartProxy format: user-country-us-sessionid-xxx
    const baseUser = username.split('-country-')[0];
    const geoUser = `${baseUser}-country-${region}`;
    return `http://${geoUser}:${password}@${host}:${port}`;
  }

  parseCredentials() {
    if (typeof this.credentials === 'string') {
      const match = this.credentials.match(/^(https?):\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/);
      if (!match) throw new Error('Invalid proxy URL format');
      return {
        protocol: match[1],
        username: match[2],
        password: match[3],
        host: match[4],
        port: match[5]
      };
    }
    return this.credentials;
  }

  /**
   * Verify geo-location via ip-api.com
   * @param {string} proxyUrl 
   * @returns {Promise<{countryCode: string, ip: string}>}
   */
  async verifyGeo(proxyUrl) {
    const got = require('got').default || require('got');
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const agent = { https: new HttpsProxyAgent(proxyUrl), http: new HttpsProxyAgent(proxyUrl) };
    
    try {
      const res = await got('http://ip-api.com/json/?fields=countryCode,query', {
        agent,
        timeout: { request: 5000 },
        retry: { limit: 1 }
      });
      const data = JSON.parse(res.body);
      return { countryCode: data.countryCode, ip: data.query };
    } catch (err) {
      return { countryCode: null, ip: null, error: err.message };
    }
  }
}

module.exports = GeoRouting;
