#!/usr/bin/env node
"use strict";

const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");

const API_URL = "https://api.brightdata.com/request";

function parseArgs(rawArgs) {
  const args = {
    url: null,
    userId: null,
    offerId: null,
    country: null,
    referrer: null,
    userAgent: null,
    timeoutMs: 90000,
    maxHops: 5,
    allowParamRedirects: false,
    verbose: false,
  };

  for (let i = 2; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const next = rawArgs[i + 1];
    switch (arg) {
      case "--url":
        args.url = next;
        i++;
        break;
      case "--user-id":
        args.userId = next;
        i++;
        break;
      case "--offer-id":
        args.offerId = next;
        i++;
        break;
      case "--country":
        args.country = next;
        i++;
        break;
      case "--referrer":
        args.referrer = next;
        i++;
        break;
      case "--ua":
      case "--user-agent":
        args.userAgent = next;
        i++;
        break;
      case "--timeout":
        args.timeoutMs = parseInt(next, 10) || args.timeoutMs;
        i++;
        break;
      case "--max-hops":
        args.maxHops = Math.max(1, parseInt(next, 10) || args.maxHops);
        i++;
        break;
      case "--allow-param-redirects":
        args.allowParamRedirects = true;
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        break;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: BRIGHTDATA_API_KEY=... node scripts/brightdata-browser-tracer.js --url <target> [options]

Options:
  --url <string>          Target URL to trace (required)
  --user-id <uuid>        User ID to fetch provider creds from settings (required)
  --offer-id <uuid>       Optional offer override to pick specific provider
  --country <code>        ISO country code (e.g., us, gb, in)
  --referrer <url>        Optional Referer header
  --ua | --user-agent     Optional User-Agent override
  --timeout <ms>          Request timeout in milliseconds (default 90000)
  --max-hops <n>          Max Bright Data fetches to follow (default 5)
  --allow-param-redirects Follow common redirect params (deeplink/url/d/redirect)
  --verbose               Print payload and response headers
  -h | --help             Show this help
`);
}

function buildPayload(args, url) {
  const payload = {
    zone: "scraping_browser1",
    url,
    format: "raw",
  };

  if (args.country) payload.country = args.country;

  if (args.referrer || args.userAgent) {
    payload.headers = {};
    if (args.referrer) payload.headers["Referer"] = args.referrer;
    if (args.userAgent) payload.headers["User-Agent"] = args.userAgent;
  }

  return payload;
}

async function fetchViaBrightData(apiKey, args, url) {
  const payload = buildPayload(args, url);

  if (args.verbose) {
    console.log("➡️  Request payload:", JSON.stringify(payload, null, 2));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bright Data error ${response.status}: ${errorText.substring(0, 800)}`);
  }

  const html = await response.text();
  return { response, html };
}

function parseMetaRefresh(html) {
  const $ = cheerio.load(html);
  const metaRefresh = $("meta[http-equiv='refresh']").attr("content");
  if (!metaRefresh) return null;
  const parts = metaRefresh.split(";");
  const urlPart = parts.find((p) => p.toLowerCase().trim().startsWith("url="));
  if (!urlPart) return null;
  const refreshUrl = urlPart.split("=")[1];
  return cleanUrl(refreshUrl);
}

function parseJsRedirect(html) {
  const scripts = [];
  const $ = cheerio.load(html);
  $("script").each((_, el) => {
    const text = $(el).html();
    if (text) scripts.push(text);
  });

  for (const code of scripts) {
    const direct = code.match(/location\s*\.\s*(?:href|replace)\s*=\s*["']([^"']+)["']/i);
    if (direct && direct[1]) return cleanUrl(direct[1]);

    const assign = code.match(/window\s*\.\s*location\s*=\s*["']([^"']+)["']/i);
    if (assign && assign[1]) return cleanUrl(assign[1]);
  }
  return null;
}

function parseParamRedirect(currentUrl) {
  try {
    const urlObj = new URL(currentUrl);
    const keys = [
      "deeplink",
      "d",
      "url",
      "u",
      "redir",
      "redirect",
      "target",
      "dest",
      "destination",
      "next",
      "return",
      "r",
    ];
    for (const key of keys) {
      const val = urlObj.searchParams.get(key);
      if (val) {
        try {
          const decoded = decodeURIComponent(val);
          if (decoded.startsWith("http")) return cleanUrl(decoded);
        } catch (e) {
          if (val.startsWith("http")) return cleanUrl(val);
        }
      }
    }
  } catch (_err) {
    return null;
  }
  return null;
}

function cleanUrl(url) {
  if (!url) return null;
  return url.trim().replace(/^['"]+|['"]+$/g, "");
}

async function loadBrightDataProvider(api, userId, offerId) {
  // If offer_id is supplied, honor its provider_id
  if (offerId) {
    const { data: offer, error: offerErr } = await api
      .from("offers")
      .select("provider_id")
      .eq("id", offerId)
      .eq("user_id", userId)
      .maybeSingle();

    if (offerErr) throw new Error(`Offer lookup failed: ${offerErr.message}`);
    if (!offer || !offer.provider_id) throw new Error("Offer has no provider_id");

    const { data: provider, error: provErr } = await api
      .from("proxy_providers")
      .select("id, api_key, name, provider_type, enabled")
      .eq("id", offer.provider_id)
      .eq("user_id", userId)
      .eq("enabled", true)
      .maybeSingle();

    if (provErr) throw new Error(`Provider lookup failed: ${provErr.message}`);
    if (!provider) throw new Error("Offer provider not found or disabled");
    if (provider.provider_type !== "brightdata_browser") {
      throw new Error(`Offer provider is ${provider.provider_type}, not brightdata_browser`);
    }
    if (!provider.api_key) throw new Error("Bright Data provider missing api_key");
    return provider.api_key;
  }

  // Otherwise pick first enabled brightdata_browser provider for the user
  const { data: provider, error } = await api
    .from("proxy_providers")
    .select("id, api_key, name")
    .eq("user_id", userId)
    .eq("provider_type", "brightdata_browser")
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Provider lookup failed: ${error.message}`);
  if (!provider) throw new Error("No enabled brightdata_browser provider for user");
  if (!provider.api_key) throw new Error("Bright Data provider missing api_key");
  return provider.api_key;
}

async function run() {
  const args = parseArgs(process.argv);
  const envApiKey = process.env.BRIGHTDATA_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!args.url) {
    console.error("❌ --url is required");
    printHelp();
    process.exit(1);
  }

  if (!args.userId && !envApiKey) {
    console.error("❌ Provide either --user-id (to fetch from Supabase) or BRIGHTDATA_API_KEY env");
    process.exit(1);
  }

  if (args.userId && (!supabaseUrl || !supabaseServiceRoleKey)) {
    console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required for --user-id mode");
    process.exit(1);
  }

  const supabase = args.userId
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

  let apiKey = envApiKey;
  if (!apiKey && args.userId && supabase) {
    apiKey = await loadBrightDataProvider(supabase, args.userId, args.offerId)
      .catch((err) => {
        console.error("❌ Failed to load Bright Data provider:", err.message);
        process.exit(1);
      });
  }

  try {
    const chain = [];
    let currentUrl = args.url;
    const seen = new Set();

    for (let hop = 1; hop <= args.maxHops; hop++) {
      if (seen.has(currentUrl)) {
        console.log("⚠️ Detected loop, stopping at:", currentUrl);
        break;
      }
      seen.add(currentUrl);

      const { response, html } = await fetchViaBrightData(apiKey, args, currentUrl);
      const snippet = html.substring(0, 800);

      if (args.verbose) {
        console.log("📡 Response headers:");
        response.headers.forEach((value, key) => {
          console.log(`  ${key}: ${value}`);
        });
      }

      console.log(`✅ Received HTML length: ${html.length} (hop ${hop})`);
      console.log("--- HTML snippet (first 800 chars) ---\n" + snippet + "\n--- end snippet ---");

      chain.push({
        idx: chain.length + 1,
        url: currentUrl,
        status: response.status,
        note: "Bright Data response",
        html_snippet: html.substring(0, 500),
      });

      const redirectedTo = response.headers.get("x-unblocker-redirected-to");
      const redirectTimeline = response.headers.get("x-unblocker-redirect-timeline");
      const finalHeader = response.headers.get("x-final-url");
      const metaRefresh = parseMetaRefresh(html);
      const jsRedirect = parseJsRedirect(html);
      const paramRedirect = args.allowParamRedirects ? parseParamRedirect(currentUrl) : null;

      if (redirectTimeline) {
        chain.push({
          idx: chain.length + 1,
          url: redirectTimeline,
          note: "redirect timeline header (as-is)",
        });
      }

      let nextUrl = redirectedTo || metaRefresh || jsRedirect || paramRedirect || null;
      nextUrl = cleanUrl(nextUrl);

      if (!nextUrl) {
        const finalUrl = finalHeader || currentUrl;
        console.log("🔁 Hop chain (no param extraction):");
        chain.forEach((hopItem) => {
          const base = `[${hopItem.idx}] ${hopItem.url}`;
          const extra = hopItem.note ? ` (${hopItem.note})` : "";
          console.log(`  ${base}${extra}`);
        });
        console.log("🏁 Final URL (as returned, no param parsing):", finalUrl);
        return;
      }

      // Follow next hop
      currentUrl = nextUrl;
    }

    console.log(`⚠️ Reached max hops (${args.maxHops}) without a terminal response.`);
    console.log("🔁 Hop chain (no param extraction):");
    chain.forEach((hopItem) => {
      const base = `[${hopItem.idx}] ${hopItem.url}`;
      const extra = hopItem.note ? ` (${hopItem.note})` : "";
      console.log(`  ${base}${extra}`);
    });
    console.log("🏁 Final URL (max hops hit, no param parsing):", chain[chain.length - 1]?.url || args.url);
  } catch (err) {
    console.error("❌ Trace failed:", err.message || err);
    process.exit(1);
  }
}

run();
