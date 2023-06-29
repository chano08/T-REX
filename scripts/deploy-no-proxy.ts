import { ethers } from 'hardhat';

async function main() {
  const [deployer, tokenAgent, claimIssuer, aliceWallet, bobWallet] = await ethers.getSigners();

  const TrustedIssuersRegistry = await ethers.getContractFactory('TrustedIssuersRegistry');
  const ClaimTopicsRegistry = await ethers.getContractFactory('ClaimTopicsRegistry');
  const IdentityRegistryStorage = await ethers.getContractFactory('IdentityRegistryStorage');
  const IdentityRegistry = await ethers.getContractFactory('IdentityRegistry');
  const ModularCompliance = await ethers.getContractFactory('ModularCompliance');
  const Token = await ethers.getContractFactory('Token');

  const trustedIssuersRegistry = await TrustedIssuersRegistry.deploy();
  await trustedIssuersRegistry.deployed();
  await trustedIssuersRegistry.init();

  const claimTopicsRegistry = await ClaimTopicsRegistry.deploy();
  await claimTopicsRegistry.deployed();
  await claimTopicsRegistry.init();
  
  const identityRegistryStorage = await IdentityRegistryStorage.deploy();
  await identityRegistryStorage.deployed();
  await identityRegistryStorage.init();

  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.deployed();
  await identityRegistry.init(trustedIssuersRegistry.address, claimTopicsRegistry.address, identityRegistryStorage.address);

  await identityRegistryStorage.bindIdentityRegistry(identityRegistry.address);

  const compliance = await ModularCompliance.deploy();
  await compliance.deployed();
  await compliance.init();

  const token = await Token.deploy();
  await token.deployed();
  await token.init(identityRegistry.address, compliance.address, 'TOKEN1', 'TKN1', 0, ethers.constants.AddressZero);

  /**
   * ----- START -----
   * 
   * establish claim topics and the claim issuer,
   * replace this with the 3rd party trusted claim issuer
   * 
   */
  const claimTopics = [ethers.utils.id('CLAIM_TOPIC')];
  await claimTopicsRegistry.addClaimTopic(claimTopics[0]);

  const claimIssuerSigningKey = ethers.Wallet.createRandom();
  const claimIssuerContract = await ethers.deployContract('ClaimIssuer', [claimIssuer.address], claimIssuer);
  await claimIssuerContract.deployed();
  await claimIssuerContract
    .connect(claimIssuer)
    .addKey(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [claimIssuerSigningKey.address])), 3, 1);
  /**
   * ----- END -----
   */


  await trustedIssuersRegistry.addTrustedIssuer(claimIssuerContract.address, claimTopics);

  console.log(`TrustedIssuersRegistry Contract deployed to ${trustedIssuersRegistry.address}`);
  console.log(`ClaimTopicsRegistry Contract deployed to ${claimTopicsRegistry.address}`);
  console.log(`IdentityRegistryStorage Contract deployed to ${identityRegistryStorage.address}`);
  console.log(`IdentityRegistry Contract deployed to ${identityRegistry.address}`);
  console.log(`Compliance Contract deployed to ${compliance.address}`);
  console.log(`Token Contract deployed to ${token.address}`);
  console.log(`ClaimIssuer Contract deployed to ${claimIssuerContract.address}`);


  /**
   * ----- START -----
   * 
   * testing purposes, removed this when deploying to live network
   */
  await token.addAgent(tokenAgent.address);
  await identityRegistry.addAgent(tokenAgent.address);

  // create a wallet identity and mint token
  const bobIdentity = await ethers.deployContract('Identity', [bobWallet.address, false], deployer);
  await identityRegistry.connect(tokenAgent).registerIdentity(bobWallet.address, bobIdentity.address, 666);

  const claimForBob = {
    data: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("Some claim public data.")),
    issuer: claimIssuerContract.address,
    topic: claimTopics[0],
    scheme: 1,
    identity: bobIdentity.address,
    signature: '',
  };
  claimForBob.signature = await claimIssuerSigningKey.signMessage(
    ethers.utils.arrayify(
      ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes'],
          [claimForBob.identity, claimForBob.topic, claimForBob.data],
        ),
      ),
    ),
  );

  await bobIdentity.connect(bobWallet).addClaim(
    claimForBob.topic,
    claimForBob.scheme,
    claimForBob.issuer,
    claimForBob.signature,
    claimForBob.data,
    '',
  );

  const aliceIdentity = await ethers.deployContract('Identity', [aliceWallet.address, false], deployer);
  await identityRegistry.connect(tokenAgent).registerIdentity(aliceWallet.address, aliceIdentity.address, 666);

  const claimForAlice = {
    data: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("Some claim public data.")),
    issuer: claimIssuerContract.address,
    topic: claimTopics[0],
    scheme: 1,
    identity: aliceIdentity.address,
    signature: '',
  };
  claimForAlice.signature = await claimIssuerSigningKey.signMessage(
    ethers.utils.arrayify(
      ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes'],
          [claimForAlice.identity, claimForAlice.topic, claimForAlice.data],
        ),
      ),
    ),
  );

  await aliceIdentity.connect(aliceWallet).addClaim(
    claimForAlice.topic,
    claimForAlice.scheme,
    claimForAlice.issuer,
    claimForAlice.signature,
    claimForAlice.data,
    '',
  );

  await token.connect(tokenAgent).mint(bobWallet.address, 500);
  let bobBalance = await token.balanceOf(bobWallet.address)
  console.log(`balance of bob wallet: ${bobBalance}`);
  let aliceBalance = await token.balanceOf(aliceWallet.address)
  console.log(`balance of alice wallet: ${aliceBalance}`);

  // transfer token
  await token.connect(tokenAgent).unpause();

  await token.connect(bobWallet).transfer(aliceWallet.address, 100);

  bobBalance = await token.balanceOf(bobWallet.address)
  console.log(`balance of bob wallet after transfer: ${bobBalance}`);
  aliceBalance = await token.balanceOf(aliceWallet.address)
  console.log(`balance of alice wallet after transfer: ${aliceBalance}`);

  /**
   * ----- END -----
   */
  
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
