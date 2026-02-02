import { ethers } from 'ethers';

const PRIVATE_KEY = '0x4e38716cdd921dfe51e7d0d54abde69f3554ace39924ff2bfacc3e094062c2c3';
const RECIPIENT = '0xAa428314e8C257411de2Cf18B5b1F86349dDdB6E';
const AMOUNT = ethers.parseEther('0.1'); // 0.1 native token

const NETWORKS = {
  base: {
    name: 'Base Sepolia',
    rpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
  },
  sonic: {
    name: 'Sonic Testnet',
    rpc: 'https://rpc.testnet.soniclabs.com',
    explorer: 'https://testnet.sonicscan.org',
  },
  optimism: {
    name: 'Optimism Sepolia',
    rpc: 'https://optimism-sepolia-public.nodies.app',
    explorer: 'https://sepolia-optimism.etherscan.io',
  },
  avalanche: {
    name: 'Avalanche Fuji',
    rpc: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
    explorer: 'https://testnet.snowtrace.io',
  },
};

async function sendNative(networkKey: keyof typeof NETWORKS) {
  const network = NETWORKS[networkKey];
  console.log(`\n📤 Sending 0.1 native token on ${network.name}...`);

  const provider = new ethers.JsonRpcProvider(network.rpc);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`  From: ${wallet.address}`);
  console.log(`  To: ${RECIPIENT}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance: ${ethers.formatEther(balance)} native`);

  if (balance < AMOUNT) {
    console.log(`  ❌ Insufficient balance on ${network.name}`);
    return;
  }

  const tx = await wallet.sendTransaction({
    to: RECIPIENT,
    value: AMOUNT,
  });

  console.log(`  TX Hash: ${tx.hash}`);
  console.log(`  Explorer: ${network.explorer}/tx/${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`  ✅ Confirmed in block ${receipt?.blockNumber}`);
}

async function main() {
  const args = process.argv.slice(2);
  const networks = args.length > 0 ? args : ['base', 'sonic'];

  console.log('=== Native Token Distribution ===');
  console.log(`Recipient: ${RECIPIENT}`);
  console.log(`Amount: 0.1 native per chain`);

  for (const net of networks) {
    if (net in NETWORKS) {
      await sendNative(net as keyof typeof NETWORKS);
    } else {
      console.log(`\n❌ Unknown network: ${net}. Available: ${Object.keys(NETWORKS).join(', ')}`);
    }
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
