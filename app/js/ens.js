// ============================================================================
// OmniFlow — Pure JS ENS Resolution (no build step, no npm)
// ============================================================================
//
// Implements ENS name resolution and DeFi payment preferences reading
// via raw eth_call to Ethereum mainnet. Uses compact keccak256 (pure JS).
// ============================================================================

import { CHAIN_CONFIG } from './utils.js';

// ============================================================================
// Compact Keccak-256 (pure JS, 32-bit arithmetic)
// Follows the same pattern as js-sha3.
// ============================================================================

const KECCAK_ROUNDS = 24;

const RC = [
  [0x00000001, 0x00000000], [0x00008082, 0x00000000],
  [0x0000808a, 0x80000000], [0x80008000, 0x80000000],
  [0x0000808b, 0x00000000], [0x80000001, 0x00000000],
  [0x80008081, 0x80000000], [0x00008009, 0x80000000],
  [0x0000008a, 0x00000000], [0x00000088, 0x00000000],
  [0x80008009, 0x00000000], [0x8000000a, 0x00000000],
  [0x8000808b, 0x00000000], [0x0000008b, 0x80000000],
  [0x00008089, 0x80000000], [0x00008003, 0x80000000],
  [0x00008002, 0x80000000], [0x00000080, 0x80000000],
  [0x0000800a, 0x00000000], [0x8000000a, 0x80000000],
  [0x80008081, 0x80000000], [0x00008080, 0x80000000],
  [0x80000001, 0x00000000], [0x80008008, 0x80000000],
];

const ROTC = [
   1, 3, 6,10,15,21,28,36,45,55, 2,14,27,41,56, 8,25,43,62,18,39,61,20,44
];

const PI = [
  10, 7,11,17,18, 3, 5,16, 8,21,24, 4,15,23,19,13,12, 2,20,14,22, 9, 6, 1
];

/**
 * Keccak-256 hash. Input: Uint8Array. Output: Uint8Array(32).
 */
function keccak256(data) {
  const rate = 136; // (1600 - 256*2) / 8
  // State: 25 lanes of 64 bits = 50 x uint32 (lo, hi interleaved)
  const s = new Uint32Array(50);

  // Absorb
  let offset = 0;
  const blockInts = rate / 4;

  while (offset + rate <= data.length) {
    for (let i = 0; i < blockInts; i++) {
      const p = offset + i * 4;
      s[i] ^= (data[p]) | (data[p + 1] << 8) | (data[p + 2] << 16) | (data[p + 3] << 24);
    }
    keccakF(s);
    offset += rate;
  }

  // Pad (keccak padding: 0x01 ... 0x80)
  const remaining = data.length - offset;
  const padded = new Uint8Array(rate);
  for (let i = 0; i < remaining; i++) padded[i] = data[offset + i];
  padded[remaining] = 0x01;
  padded[rate - 1] |= 0x80;

  for (let i = 0; i < blockInts; i++) {
    const p = i * 4;
    s[i] ^= (padded[p]) | (padded[p + 1] << 8) | (padded[p + 2] << 16) | (padded[p + 3] << 24);
  }
  keccakF(s);

  // Squeeze — output 32 bytes
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const v = s[i];
    out[i * 4]     = v & 0xff;
    out[i * 4 + 1] = (v >>> 8) & 0xff;
    out[i * 4 + 2] = (v >>> 16) & 0xff;
    out[i * 4 + 3] = (v >>> 24) & 0xff;
  }
  return out;
}

/**
 * Keccak-f[1600] permutation on 50 x uint32 state (lo/hi interleaved).
 */
function keccakF(s) {
  let h, l, th, tl;

  for (let round = 0; round < KECCAK_ROUNDS; round++) {
    // Theta — column parities
    const clo = new Uint32Array(5);
    const chi = new Uint32Array(5);
    for (let x = 0; x < 5; x++) {
      clo[x] = s[x * 2] ^ s[(x + 5) * 2] ^ s[(x + 10) * 2] ^ s[(x + 15) * 2] ^ s[(x + 20) * 2];
      chi[x] = s[x * 2 + 1] ^ s[(x + 5) * 2 + 1] ^ s[(x + 10) * 2 + 1] ^ s[(x + 15) * 2 + 1] ^ s[(x + 20) * 2 + 1];
    }
    for (let x = 0; x < 5; x++) {
      const nx = (x + 1) % 5;
      const px = (x + 4) % 5;
      // D[x] = C[x-1] ^ rot(C[x+1], 1)
      const dlo = clo[px] ^ ((clo[nx] << 1) | (chi[nx] >>> 31));
      const dhi = chi[px] ^ ((chi[nx] << 1) | (clo[nx] >>> 31));
      for (let y = 0; y < 25; y += 5) {
        s[(y + x) * 2] ^= dlo;
        s[(y + x) * 2 + 1] ^= dhi;
      }
    }

    // Rho + Pi
    l = s[1 * 2];
    h = s[1 * 2 + 1];
    for (let t = 0; t < 24; t++) {
      const j = PI[t];
      const tl2 = s[j * 2];
      const th2 = s[j * 2 + 1];
      const r = ROTC[t];
      if (r < 32) {
        s[j * 2] = (l << r) | (h >>> (32 - r));
        s[j * 2 + 1] = (h << r) | (l >>> (32 - r));
      } else {
        s[j * 2] = (h << (r - 32)) | (l >>> (64 - r));
        s[j * 2 + 1] = (l << (r - 32)) | (h >>> (64 - r));
      }
      l = tl2;
      h = th2;
    }

    // Chi
    for (let y = 0; y < 25; y += 5) {
      const t0l = s[y * 2], t0h = s[y * 2 + 1];
      const t1l = s[(y + 1) * 2], t1h = s[(y + 1) * 2 + 1];
      const t2l = s[(y + 2) * 2], t2h = s[(y + 2) * 2 + 1];
      const t3l = s[(y + 3) * 2], t3h = s[(y + 3) * 2 + 1];
      const t4l = s[(y + 4) * 2], t4h = s[(y + 4) * 2 + 1];
      s[y * 2]       = t0l ^ (~t1l & t2l); s[y * 2 + 1]       = t0h ^ (~t1h & t2h);
      s[(y + 1) * 2] = t1l ^ (~t2l & t3l); s[(y + 1) * 2 + 1] = t1h ^ (~t2h & t3h);
      s[(y + 2) * 2] = t2l ^ (~t3l & t4l); s[(y + 2) * 2 + 1] = t2h ^ (~t3h & t4h);
      s[(y + 3) * 2] = t3l ^ (~t4l & t0l); s[(y + 3) * 2 + 1] = t3h ^ (~t4h & t0h);
      s[(y + 4) * 2] = t4l ^ (~t0l & t1l); s[(y + 4) * 2 + 1] = t4h ^ (~t0h & t1h);
    }

    // Iota
    s[0] ^= RC[round][0];
    s[1] ^= RC[round][1];
  }
}

// ============================================================================
// Hex / bytes helpers
// ============================================================================

function bytesToHex(bytes) {
  let hex = '0x';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex) {
  if (hex.startsWith('0x')) hex = hex.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function stringToBytes(str) {
  return new TextEncoder().encode(str);
}

function keccak256Hex(data) {
  return bytesToHex(keccak256(data));
}

// ============================================================================
// ENS namehash (ENSIP-1)
// ============================================================================

/**
 * ENS namehash per ENSIP-1: recursive keccak256 of labels.
 * Basic .toLowerCase() normalization (skip full UTS-46 for hackathon).
 * @param {string} name - e.g. "vitalik.eth"
 * @returns {string} 0x-prefixed 32-byte hex
 */
export function namehash(name) {
  let node = new Uint8Array(32); // 0x00...00
  if (!name) return bytesToHex(node);

  const labels = name.toLowerCase().split('.');
  for (let i = labels.length - 1; i >= 0; i--) {
    const labelHash = keccak256(stringToBytes(labels[i]));
    const combined = new Uint8Array(64);
    combined.set(node, 0);
    combined.set(labelHash, 32);
    node = keccak256(combined);
  }
  return bytesToHex(node);
}

// ============================================================================
// ABI encoding / decoding helpers
// ============================================================================

// Pre-computed selectors
const SEL_RESOLVER = '0x0178b8bf'; // resolver(bytes32)
const SEL_ADDR     = '0x3b3b57de'; // addr(bytes32)
const SEL_TEXT     = '0x59d1d43c'; // text(bytes32,string)

/** Pad a hex value (no 0x) to 32 bytes (64 hex chars), left-padded */
function padLeft(hex, len = 64) {
  return hex.padStart(len, '0');
}

/** Encode bytes32 argument (already a 0x hex string) */
function encodeBytes32(hexStr) {
  return hexStr.slice(2).padStart(64, '0');
}

/** Encode a string as ABI dynamic type (offset + length + data) */
function encodeString(str) {
  const bytes = stringToBytes(str);
  const len = padLeft(bytes.length.toString(16));
  let dataHex = '';
  for (let i = 0; i < bytes.length; i++) {
    dataHex += bytes[i].toString(16).padStart(2, '0');
  }
  // Pad data to 32-byte boundary
  const padLen = Math.ceil(bytes.length / 32) * 32;
  dataHex = dataHex.padEnd(padLen * 2, '0');
  return len + dataHex;
}

/** Decode an ABI-encoded address from a 32-byte hex return value */
function decodeAddress(hex) {
  if (!hex || hex === '0x' || hex.length < 66) return null;
  const raw = hex.slice(2).slice(24, 64); // last 20 bytes of 32-byte word
  const addr = '0x' + raw;
  if (addr === '0x0000000000000000000000000000000000000000') return null;
  return addr;
}

/** Decode an ABI-encoded string return value */
function decodeString(hex) {
  if (!hex || hex === '0x' || hex.length < 130) return null;
  const data = hex.slice(2);
  // First word: offset to string data (should be 0x20 = 32)
  // Second word: string length
  const strLen = parseInt(data.slice(64, 128), 16);
  if (strLen === 0) return null;
  // String bytes start at offset 128 hex chars (64 bytes from start)
  const strHex = data.slice(128, 128 + strLen * 2);
  const bytes = hexToBytes(strHex);
  return new TextDecoder().decode(bytes);
}

// ============================================================================
// Raw JSON-RPC eth_call
// ============================================================================

const ETH_MAINNET_RPC = CHAIN_CONFIG.ethereum.rpc;

async function ethCall(to, data) {
  const res = await fetch(ETH_MAINNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// ============================================================================
// ENS contracts
// ============================================================================

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

// ============================================================================
// Resolver cache (session-scoped)
// ============================================================================

const resolverCache = new Map();

async function getResolver(nameNode) {
  if (resolverCache.has(nameNode)) return resolverCache.get(nameNode);
  const calldata = SEL_RESOLVER + encodeBytes32(nameNode);
  const result = await ethCall(ENS_REGISTRY, calldata);
  const resolver = decodeAddress(result);
  if (resolver) resolverCache.set(nameNode, resolver);
  return resolver;
}

// ============================================================================
// DeFi preference keys (mirrors frontend/src/lib/ens/resolver.ts)
// ============================================================================

const DEFI_PREF_KEYS = {
  chain:    'com.omniflow.chain',
  token:    'com.omniflow.token',
  slippage: 'com.omniflow.slippage',
  router:   'com.omniflow.router',
  address:  'com.omniflow.address',
};

// ============================================================================
// Exported functions
// ============================================================================

/**
 * Check if input looks like an ENS name (ends with .eth)
 * @param {string} input
 * @returns {boolean}
 */
export function isENSName(input) {
  if (!input || typeof input !== 'string') return false;
  return /^[a-zA-Z0-9-]+\.eth$/i.test(input.trim());
}

/**
 * Resolve an ENS name to an Ethereum address.
 * Registry lookup for resolver, then addr() call.
 * @param {string} name - e.g. "vitalik.eth"
 * @returns {Promise<string|null>} 0x address or null
 */
export async function resolveAddress(name) {
  const node = namehash(name);
  const resolver = await getResolver(node);
  if (!resolver) return null;

  const calldata = SEL_ADDR + encodeBytes32(node);
  const result = await ethCall(resolver, calldata);
  return decodeAddress(result);
}

/**
 * Read a single ENS text record.
 * @param {string} name - ENS name
 * @param {string} key - text record key
 * @returns {Promise<string|null>}
 */
export async function getTextRecord(name, key) {
  const node = namehash(name);
  const resolver = await getResolver(node);
  if (!resolver) return null;

  // text(bytes32 node, string key)
  // ABI: selector + node + offset_to_key + key_data
  const nodeEnc = encodeBytes32(node);
  const offsetEnc = padLeft((64).toString(16)); // offset = 0x40 = 64 bytes
  const keyEnc = encodeString(key);
  const calldata = SEL_TEXT + nodeEnc + offsetEnc + keyEnc;
  const result = await ethCall(resolver, calldata);
  return decodeString(result);
}

/**
 * Read all DeFi payment preferences from ENS text records (in parallel).
 * @param {string} name - ENS name
 * @returns {Promise<Object>} { chain, token, slippage, router, address }
 */
export async function getDefiPreferences(name) {
  const keys = Object.entries(DEFI_PREF_KEYS);
  const results = await Promise.all(
    keys.map(([, key]) => getTextRecord(name, key))
  );
  const prefs = {};
  keys.forEach(([field], i) => {
    if (results[i]) prefs[field] = results[i];
  });
  return prefs;
}

/**
 * Combined resolution: address + DeFi preferences in one call.
 * @param {string} name - ENS name
 * @returns {Promise<{address: string|null, preferences: Object}>}
 */
export async function resolveENS(name) {
  const [address, preferences] = await Promise.all([
    resolveAddress(name),
    getDefiPreferences(name),
  ]);
  return { address, preferences };
}
