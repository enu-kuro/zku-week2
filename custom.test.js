const hre = require('hardhat')
const { ethers } = hre
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, prepareTransaction } = require('../src/index')
const { toFixedHex } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

it('Question 3. Tornado Cash', async () => {
  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  /** setup MerkleTreeWithHistoryMock */
  require('../scripts/compileHasher')
  const hasher = await deploy('Hasher')
  const merkleTreeWithHistory = await deploy('MerkleTreeWithHistoryMock', MERKLE_TREE_HEIGHT, hasher.address)
  await merkleTreeWithHistory.initialize()
  const gas = await merkleTreeWithHistory.estimateGas.insert(toFixedHex(123), toFixedHex(456))

  /** Q1: estimate and print gas needed to insert a pair of leaves to MerkleTreeWithHistory */
  // gas cost: 192309 wei
  console.log('gas cost:', gas.toNumber(), 'wei')

  /** setup TornadoPool */
  require('../scripts/compileHasher')
  const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
  const verifier2 = await deploy('Verifier2')
  const verifier16 = await deploy('Verifier16')
  const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
  await token.mint(sender.address, utils.parseEther('10000'))

  const amb = await deploy('MockAMB', gov.address, l1ChainId)
  const omniBridge = await deploy('MockOmniBridge', amb.address)

  /** @type {TornadoPool} */
  const tornadoPoolImpl = await deploy(
    'TornadoPool',
    verifier2.address,
    verifier16.address,
    MERKLE_TREE_HEIGHT,
    hasher.address,
    token.address,
    omniBridge.address,
    l1Unwrapper.address,
    gov.address,
    l1ChainId,
    multisig.address,
  )

  const { data } = await tornadoPoolImpl.populateTransaction.initialize(
    MINIMUM_WITHDRAWAL_AMOUNT,
    MAXIMUM_DEPOSIT_AMOUNT,
  )
  const proxy = await deploy(
    'CrossChainUpgradeableProxy',
    tornadoPoolImpl.address,
    gov.address,
    data,
    amb.address,
    l1ChainId,
  )

  const tornadoPool = tornadoPoolImpl.attach(proxy.address)

  await token.approve(tornadoPool.address, utils.parseEther('10000'))

  /** Q2 deposit 0.08 ETH in L1 */
  const aliceKeypair = new Keypair()

  const aliceDepositAmount = utils.parseEther('0.08')
  const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
  const { args, extData } = await prepareTransaction({
    tornadoPool,
    outputs: [aliceDepositUtxo],
  })

  const onTokenBridgedData = encodeDataForBridge({
    proof: args,
    extData,
  })

  const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
    token.address,
    aliceDepositUtxo.amount,
    onTokenBridgedData,
  )

  await token.transfer(omniBridge.address, aliceDepositAmount)
  const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)

  await omniBridge.execute([
    { who: token.address, callData: transferTx.data },
    { who: tornadoPool.address, callData: onTokenBridgedTx.data },
  ])

  const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
  // 0.08 ETH
  console.log(ethers.utils.formatEther(tornadoPoolBalance), 'ETH')

  /** Q3 withdraw 0.05 ETH in L2 */
  const aliceWithdrawAmount = utils.parseEther('0.05')
  const aliceEthAddress = '0xDeaD00000000000000000000000000000000BEEf'
  const aliceChangeUtxo = new Utxo({
    amount: aliceDepositAmount.sub(aliceWithdrawAmount),
    keypair: aliceKeypair,
  })

  await transaction({
    tornadoPool,
    inputs: [aliceDepositUtxo],
    outputs: [aliceChangeUtxo],
    recipient: aliceEthAddress,
    isL1Withdrawal: false,
  })
  const aliceBalance = await token.balanceOf(aliceEthAddress)
  // 0.05 ETH
  console.log(ethers.utils.formatEther(aliceBalance), 'ETH')

  /** Q4 assert recipient, omniBridge, and tornadoPool balances are correct */
  // recipient
  expect(aliceBalance).to.be.equal(aliceWithdrawAmount) // 0.05 ETH

  // omniBridge
  const omniBridgeBalance = await token.balanceOf(omniBridge.address)
  expect(omniBridgeBalance).to.be.equal(0) // 0 ETH

  // tornadoPool
  const tornadoPoolBalanceAfterWithdrawal = await token.balanceOf(tornadoPool.address)
  expect(tornadoPoolBalanceAfterWithdrawal).to.be.equal(aliceDepositAmount.sub(aliceWithdrawAmount)) // 0.03 ETH
})
