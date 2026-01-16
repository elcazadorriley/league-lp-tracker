/**
 * Shared constants for the LP Tracker application.
 * Used by API serverless functions.
 *
 * NOTE: Frontend (public/app.js) has its own copy of some constants
 * since it runs in the browser and cannot import CommonJS modules.
 */

/**
 * Riot API region configuration.
 * Maps user-friendly region codes to Riot's platform and regional routing values.
 *
 * @type {Object.<string, {platform: string, regional: string}>}
 * @property {string} platform - Platform routing value (e.g., 'na1') for game data APIs
 * @property {string} regional - Regional routing value (e.g., 'americas') for account APIs
 */
const REGIONS = {
  NA: { platform: 'na1', regional: 'americas' },
  BR: { platform: 'br1', regional: 'americas' },
  LAN: { platform: 'la1', regional: 'americas' },
  LAS: { platform: 'la2', regional: 'americas' },
  EUW: { platform: 'euw1', regional: 'europe' },
  EUNE: { platform: 'eun1', regional: 'europe' },
  TR: { platform: 'tr1', regional: 'europe' },
  RU: { platform: 'ru', regional: 'europe' },
  KR: { platform: 'kr', regional: 'asia' },
  JP: { platform: 'jp1', regional: 'asia' },
  OCE: { platform: 'oc1', regional: 'sea' },
  PH: { platform: 'ph2', regional: 'sea' },
  SG: { platform: 'sg2', regional: 'sea' },
  TH: { platform: 'th2', regional: 'sea' },
  TW: { platform: 'tw2', regional: 'sea' },
  VN: { platform: 'vn2', regional: 'sea' },
};

/**
 * Riot API queue ID for Ranked Solo/Duo.
 * @type {number}
 */
const RANKED_SOLO_QUEUE_ID = 420;

/**
 * Riot API queue type string for Ranked Solo/Duo.
 * @type {string}
 */
const RANKED_SOLO_QUEUE_TYPE = 'RANKED_SOLO_5x5';

/**
 * Default number of matches to fetch from Riot API.
 * @type {number}
 */
const DEFAULT_MATCH_COUNT = 20;

/**
 * Maximum number of matches allowed per API request.
 * @type {number}
 */
const MAX_MATCH_COUNT = 50;

/**
 * Delay between match detail requests to avoid rate limiting (ms).
 * @type {number}
 */
const MATCH_FETCH_DELAY_MS = 50;

module.exports = {
  REGIONS,
  RANKED_SOLO_QUEUE_ID,
  RANKED_SOLO_QUEUE_TYPE,
  DEFAULT_MATCH_COUNT,
  MAX_MATCH_COUNT,
  MATCH_FETCH_DELAY_MS,
};
