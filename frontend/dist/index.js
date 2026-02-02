"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IRIS_API_SANDBOX = exports.ARC_TESTNET = exports.CHAINS = exports.BROWSER_USAGE_INSTRUCTIONS = exports.clearStoredWalletInfo = exports.getStoredWalletInfo = exports.storeWalletInfo = exports.getExplorerUrl = exports.isValidAddress = exports.isWebAuthnSupported = exports.CircleConfig = exports.mintAllOnArc = exports.mintOnArc = exports.pollAttestations = exports.pollAttestation = exports.burnOnSourceChains = exports.burnOnChain = exports.collectFromChain = exports.collectToArc = void 0;
// Main exports
var collectToArc_1 = require("./lib/collectToArc");
Object.defineProperty(exports, "collectToArc", { enumerable: true, get: function () { return collectToArc_1.collectToArc; } });
Object.defineProperty(exports, "collectFromChain", { enumerable: true, get: function () { return collectToArc_1.collectFromChain; } });
// CCTP modules
var burn_1 = require("./lib/cctp/burn");
Object.defineProperty(exports, "burnOnChain", { enumerable: true, get: function () { return burn_1.burnOnChain; } });
Object.defineProperty(exports, "burnOnSourceChains", { enumerable: true, get: function () { return burn_1.burnOnSourceChains; } });
var attestation_1 = require("./lib/cctp/attestation");
Object.defineProperty(exports, "pollAttestation", { enumerable: true, get: function () { return attestation_1.pollAttestation; } });
Object.defineProperty(exports, "pollAttestations", { enumerable: true, get: function () { return attestation_1.pollAttestations; } });
var mint_1 = require("./lib/cctp/mint");
Object.defineProperty(exports, "mintOnArc", { enumerable: true, get: function () { return mint_1.mintOnArc; } });
Object.defineProperty(exports, "mintAllOnArc", { enumerable: true, get: function () { return mint_1.mintAllOnArc; } });
// Wallet management (Modular Wallets with Passkey)
var wallets_1 = require("./lib/wallets");
Object.defineProperty(exports, "CircleConfig", { enumerable: true, get: function () { return wallets_1.CircleConfig; } });
Object.defineProperty(exports, "isWebAuthnSupported", { enumerable: true, get: function () { return wallets_1.isWebAuthnSupported; } });
Object.defineProperty(exports, "isValidAddress", { enumerable: true, get: function () { return wallets_1.isValidAddress; } });
Object.defineProperty(exports, "getExplorerUrl", { enumerable: true, get: function () { return wallets_1.getExplorerUrl; } });
Object.defineProperty(exports, "storeWalletInfo", { enumerable: true, get: function () { return wallets_1.storeWalletInfo; } });
Object.defineProperty(exports, "getStoredWalletInfo", { enumerable: true, get: function () { return wallets_1.getStoredWalletInfo; } });
Object.defineProperty(exports, "clearStoredWalletInfo", { enumerable: true, get: function () { return wallets_1.clearStoredWalletInfo; } });
Object.defineProperty(exports, "BROWSER_USAGE_INSTRUCTIONS", { enumerable: true, get: function () { return wallets_1.BROWSER_USAGE_INSTRUCTIONS; } });
// Config
var chains_1 = require("./config/chains");
Object.defineProperty(exports, "CHAINS", { enumerable: true, get: function () { return chains_1.CHAINS; } });
Object.defineProperty(exports, "ARC_TESTNET", { enumerable: true, get: function () { return chains_1.ARC_TESTNET; } });
Object.defineProperty(exports, "IRIS_API_SANDBOX", { enumerable: true, get: function () { return chains_1.IRIS_API_SANDBOX; } });
