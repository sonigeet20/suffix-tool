/**
 * Robust Anti-Cloaking Redirect Tracer
 * Multi-layered detection with geo-targeting, UA rotation, and intelligent fallback
 */

const got = require('got').default || require('got');
const { HttpsProxyAgent } = require('https-proxy-agent');
const tough = require('tough-cookie');

const httpHeaders = require('./redirect-engines/http-headers');
const metaRefresh = require('./redirect-engines/meta-refresh');
const jsStatic = require('./redirect-engines/js-static');
const formBased = require('./redirect-engines/form-based');

class RobustTracer {
  constructor(options = {}) {
    this.geoRouting = options.geoRouting;
    this.uaRotation = options.uaRotation;
    this.maxHops = options.maxHops || 20;
    this.timeout = options.timeout || 3000;
    this.verbose = options.verbose || false;
    this.browserFallback = options.browserFallback || false;
  }

  async trace(url, geo = 'us') {
    const startTime = Date.now();
    const chain = [];
    let current = url;
    const visited = new Set();
    const jar = new tough.CookieJar();
    
    // Get proxy for geo
    const proxyUrl = this.geoRouting ? this.geoRouting.getProxyUrl(geo) : null;
    const agent = proxyUrl ? {
      https: new HttpsProxyAgent(proxyUrl),
      http: new HttpsProxyAgent(proxyUrl)
    } : undefined;
    
    this.log(`Starting trace with geo=${geo}, proxy=${proxyUrl ? 'enabled' : 'disabled'}`);
    
    for (let hop = 1; hop <= this.maxHops; hop++) {
      if (visited.has(current)) {
        this.log(`Loop detected at hop ${hop}, stopping`);
        break;
      }
      visited.add(current);
      
      this.log(`Hop ${hop}: ${current}`);
      const hopStart = Date.now();
      
      try {
        // Try HEAD first (fastest)
        let result = await this.tryHead(current, agent, jar);
        
        // Fallback to GET+Range if HEAD fails or returns 404/405
        if (!result || result.statusCode === 404 || result.statusCode === 405 || result.statusCode === 501) {
          result = await this.tryGetMinimal(current, agent, jar);
        }
        
        // If still 404 or no redirect, try full GET
        if (!result || result.statusCode === 404 || !result.redirect) {
          result = await this.tryGetFull(current, agent, jar);
        }
        
        if (!result) {
          chain.push({
            hop,
            url: current,
            status: 'error',
            redirectType: 'none',
            location: null,
            detectedBy: null,
            confidence: null,
            ms: Date.now() - hopStart,
            geo
          });
          break;
        }
        
        const { statusCode, redirect, body } = result;
        const hopMs = Date.now() - hopStart;
        
        chain.push({
          hop,
          url: current,
          status: statusCode,
          redirectType: redirect ? redirect.type : 'none',
          location: redirect ? redirect.url : null,
          detectedBy: redirect ? redirect.type.split('_')[0] : null,
          confidence: redirect ? redirect.confidence : null,
          ms: hopMs,
          geo
        });
        
        if (!redirect || !redirect.url) {
          this.log(`No redirect found at hop ${hop}, stopping`);
          break;
        }
        
        current = redirect.url;
        
      } catch (err) {
        this.log(`Error at hop ${hop}: ${err.message}`);
        chain.push({
          hop,
          url: current,
          status: 'error',
          redirectType: 'error',
          location: null,
          detectedBy: null,
          confidence: null,
          ms: Date.now() - hopStart,
          geo,
          error: err.message
        });
        break;
      }
    }
    
    const totalMs = Date.now() - startTime;
    const finalUrl = chain[chain.length - 1]?.location || chain[chain.length - 1]?.url;
    
    return {
      chain,
      finalUrl,
      totalMs,
      success: chain.length > 0 && chain[chain.length - 1].status !== 'error',
      geo
    };
  }

  async tryHead(url, agent, jar) {
    try {
      const headers = this.uaRotation.getHeaders();
      const res = await got(url, {
        method: 'HEAD',
        headers,
        agent,
        cookieJar: jar,
        followRedirect: false,
        timeout: { request: Math.min(this.timeout, 1000) },
        retry: { limit: 0 },
        throwHttpErrors: false
      });
      
      const redirect = httpHeaders.detectRedirect(res, url);
      return { statusCode: res.statusCode, redirect, body: null };
    } catch (err) {
      this.log(`HEAD failed: ${err.message}`);
      return null;
    }
  }

  async tryGetMinimal(url, agent, jar) {
    try {
      const headers = { ...this.uaRotation.getHeaders(), 'Range': 'bytes=0-0' };
      const res = await got(url, {
        method: 'GET',
        headers,
        agent,
        cookieJar: jar,
        followRedirect: false,
        timeout: { request: Math.min(this.timeout, 1500) },
        retry: { limit: 0 },
        throwHttpErrors: false
      });
      
      const redirect = httpHeaders.detectRedirect(res, url);
      return { statusCode: res.statusCode, redirect, body: res.body || '' };
    } catch (err) {
      this.log(`GET+Range failed: ${err.message}`);
      return null;
    }
  }

  async tryGetFull(url, agent, jar) {
    try {
      const headers = this.uaRotation.getHeaders();
      const res = await got(url, {
        method: 'GET',
        headers,
        agent,
        cookieJar: jar,
        followRedirect: false,
        timeout: { request: this.timeout },
        retry: { limit: 0 },
        throwHttpErrors: false
      });
      
      const body = res.body || '';
      
      // Try detection engines in priority order
      let redirect = httpHeaders.detectRedirect(res, url);
      
      if (!redirect && body) {
        redirect = metaRefresh.detectRedirect(body, url) ||
                   jsStatic.detectRedirect(body, url) ||
                   formBased.detectRedirect(body, url);
      }
      
      return { statusCode: res.statusCode, redirect, body };
    } catch (err) {
      this.log(`GET failed: ${err.message}`);
      return null;
    }
  }

  log(msg) {
    if (this.verbose) {
      console.log(`[RobustTracer] ${msg}`);
    }
  }
}

module.exports = RobustTracer;
