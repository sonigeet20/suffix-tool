// Dedicated GeoIP Service
// Single instance that serves IP geolocation queries for all proxy instances
// Eliminates need to download databases on every instance

const express = require('express');
const maxmind = require('maxmind');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.GEOIP_PORT || 3000;

let cityReader = null;
let asnReader = null;

// Initialize readers
async function initializeReaders() {
  try {
    const cityPath = path.join(__dirname, 'geoip/GeoLite2-City.mmdb');
    const asnPath = path.join(__dirname, 'geoip/GeoLite2-ASN.mmdb');

    if (!fs.existsSync(cityPath) || !fs.existsSync(asnPath)) {
      console.error('GeoIP databases not found. Download them first:');
      console.error('  bash setup-geoip-databases.sh');
      process.exit(1);
    }

    console.log('Loading GeoIP databases...');
    cityReader = await maxmind.open(cityPath);
    asnReader = await maxmind.open(asnPath);
    console.log('✓ GeoIP databases loaded successfully');
  } catch (error) {
    console.error('Failed to load GeoIP databases:', error);
    process.exit(1);
  }
}

// Health check
app.get('/health', (req, res) => {
  if (!cityReader || !asnReader) {
    return res.status(503).json({ status: 'unhealthy', error: 'Databases not loaded' });
  }
  res.json({ status: 'healthy', databases: 'ready' });
});

// Query GeoIP data for an IP
app.get('/geoip/:ip', (req, res) => {
  try {
    if (!cityReader || !asnReader) {
      return res.status(503).json({ error: 'Databases not loaded' });
    }

    const ip = req.params.ip;
    
    // Validate IP format
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return res.status(400).json({ error: 'Invalid IP format' });
    }

    // Get city data
    const cityData = cityReader.get(ip);
    const asnData = asnReader.get(ip);

    const result = {
      ip: ip,
      country: cityData?.country?.iso_code || 'UNKNOWN',
      country_name: cityData?.country?.names?.en || 'Unknown',
      city: cityData?.city?.names?.en || null,
      latitude: cityData?.location?.latitude || null,
      longitude: cityData?.location?.longitude || null,
      asn: asnData?.autonomous_system_number || null,
      asn_organization: asnData?.autonomous_system_organization || null,
      is_datacenter: isDatacenter(asnData?.autonomous_system_organization, asnData?.autonomous_system_number)
    };

    res.json(result);
  } catch (error) {
    console.error('GeoIP lookup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch query (multiple IPs)
app.post('/geoip/batch', express.json(), (req, res) => {
  try {
    if (!cityReader || !asnReader) {
      return res.status(503).json({ error: 'Databases not loaded' });
    }

    const { ips } = req.body;
    
    if (!Array.isArray(ips) || ips.length === 0) {
      return res.status(400).json({ error: 'ips array required' });
    }

    if (ips.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 IPs per request' });
    }

    const results = ips.map(ip => {
      try {
        const cityData = cityReader.get(ip);
        const asnData = asnReader.get(ip);

        return {
          ip: ip,
          country: cityData?.country?.iso_code || 'UNKNOWN',
          asn: asnData?.autonomous_system_number || null,
          is_datacenter: isDatacenter(asnData?.autonomous_system_organization, asnData?.autonomous_system_number)
        };
      } catch (err) {
        return { ip: ip, error: err.message };
      }
    });

    res.json({ results });
  } catch (error) {
    console.error('Batch GeoIP error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if ASN is datacenter
function isDatacenter(asnOrg, asn) {
  if (!asn) return false;

  // Known datacenter ASNs
  const datacenterASNs = [
    16509,  // Amazon AWS
    15169,  // Google Cloud
    8075,   // Microsoft Azure
    14061,  // DigitalOcean
    20473,  // Choopa (Vultr)
    16276,  // OVH
    24940,  // Hetzner
    19531,  // ParkLogic (suspicious)
    8452,   // Tedata Egypt
  ];

  if (datacenterASNs.includes(asn)) {
    return true;
  }

  // Check organization name for datacenter keywords
  if (asnOrg) {
    const keywords = ['amazon', 'aws', 'google cloud', 'azure', 'digitalocean', 'vultr', 'ovh', 'hetzner', 'linode', 'hosting', 'server', 'datacenter', 'cloud'];
    const orgLower = asnOrg.toLowerCase();
    return keywords.some(keyword => orgLower.includes(keyword));
  }

  return false;
}

// Initialize and start
initializeReaders().then(() => {
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`GeoIP Service running on port ${PORT}`);
    console.log(`========================================`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /health              - Health check`);
    console.log(`  GET  /geoip/:ip           - Query single IP`);
    console.log(`  POST /geoip/batch         - Query multiple IPs (max 100)`);
    console.log(`\nExample:`);
    console.log(`  curl http://localhost:3001/geoip/8.8.8.8`);
    console.log(`\n========================================\n`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
