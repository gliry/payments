// ============================================================================
// OmniFlow Dashboard — Passkey Auth (Circle SDK)
// ============================================================================

let toPasskeyTransport, toModularTransport, toWebAuthnCredential, WebAuthnMode;
let toCircleSmartAccount, toWebAuthnAccount;
let createPublicClient, defineChain;
let sdkLoaded = false;

// Configuration
const CIRCLE_CLIENT_URL = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl';
const CIRCLE_CLIENT_KEY = 'TEST_CLIENT_KEY:3a7c33087a5778dae06374364113e8de:324e884310a56ba506340bec23de86f2';
const NETWORK = 'arcTestnet';

let arcTestnet = null;

/**
 * Load Circle SDK + Viem from CDN
 */
async function loadSDK() {
  if (sdkLoaded) return;

  const circleSDK = await import('https://esm.sh/@circle-fin/modular-wallets-core@1');
  toPasskeyTransport = circleSDK.toPasskeyTransport;
  toModularTransport = circleSDK.toModularTransport;
  toWebAuthnCredential = circleSDK.toWebAuthnCredential;
  toCircleSmartAccount = circleSDK.toCircleSmartAccount;
  WebAuthnMode = circleSDK.WebAuthnMode;

  const viemSDK = await import('https://esm.sh/viem@2');
  createPublicClient = viemSDK.createPublicClient;
  defineChain = viemSDK.defineChain;

  const viemAA = await import('https://esm.sh/viem@2/account-abstraction');
  toWebAuthnAccount = viemAA.toWebAuthnAccount;

  arcTestnet = defineChain({
    id: 16180,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://rpc-testnet.arc.io'] },
    },
    blockExplorers: {
      default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
    },
    testnet: true,
  });

  sdkLoaded = true;
}

/**
 * Create smart account from credential
 */
async function getSmartAccount(credential) {
  const modularTransport = toModularTransport(
    `${CIRCLE_CLIENT_URL}/${NETWORK}`,
    CIRCLE_CLIENT_KEY
  );

  const client = createPublicClient({
    chain: arcTestnet,
    transport: modularTransport,
  });

  const owner = toWebAuthnAccount({ credential });
  const smartAccount = await toCircleSmartAccount({ client, owner });

  return smartAccount;
}

/**
 * Register new passkey → create smart account
 */
export async function registerPasskey(username) {
  await loadSDK();

  const passkeyTransport = toPasskeyTransport(CIRCLE_CLIENT_URL, CIRCLE_CLIENT_KEY);

  const credential = await toWebAuthnCredential({
    transport: passkeyTransport,
    mode: WebAuthnMode.Register,
    username,
  });

  const smartAccount = await getSmartAccount(credential);

  return {
    address: smartAccount.address,
    username,
    credentialId: credential.id,
    publicKey: credential.publicKey,
  };
}

/**
 * Login with existing passkey
 */
export async function loginPasskey(username) {
  await loadSDK();

  const passkeyTransport = toPasskeyTransport(CIRCLE_CLIENT_URL, CIRCLE_CLIENT_KEY);

  const credential = await toWebAuthnCredential({
    transport: passkeyTransport,
    mode: WebAuthnMode.Login,
    username,
  });

  const smartAccount = await getSmartAccount(credential);

  return {
    address: smartAccount.address,
    username,
    credentialId: credential.id,
    publicKey: credential.publicKey,
  };
}
