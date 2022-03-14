# Assignment 2

## Question 1: Privacy & ZK VMs

### 1. Explain in brief, how does the existing blockchain state transition to a new state? What is the advantage of using zk based verification over re-execution for state transition?

Blockchain's state transition system is called State Transition Function (STF) in which current state and input data dicide next state. This transaction will be verified by some verification mechanism which differ from blockchain. To get consensus, each nodes re-execute STF. And newcomers have to re-execute all the transactions to generate the current state of the blockchain.
But Re-Execution has a lot of disadvantages.
See "The Problem with Re-Execution" section in [zCloak Network: a Technical Overview](https://zcloaknetwork.medium.com/zcloak-network-a-technical-overview-254e59a8d1c2).

In zk based verification, you can verify your inputs and state offchain. It means you don't need to open your sensitive input data to the public and reduce computation overhead on blockchain. So if you can verify the validity (integrity) of a computation without re-execution, the problems of the re-execution model can be easily solved.

### 2. Explain in brief what is a ZK VM (virtual machine) and how it works?

A ZK VM is a circuit that executes bytecode. It allows a prover to show that, given a set of inputs, as well as some bytecode, they have correctly executed the program code on said inputs.
referenced from [Zero-knowledge Virtual Machines, the Polaris License, and Vendor Lock-in](https://medium.com/zeroknowledge/zero-knowledge-virtual-machines-the-polaris-license-and-vendor-lock-in-ab2c631cf139)

- Zinc

  Used in zkSync platform. Existing ZKP frameworks lack functionality specific to smart contracts. Zinc adopts a programing language designed specifically for developing smart contracts and zero-knowledge proof circuits with a flat learning curve.
  https://docs.zksync.io/dev/contracts/#zinc

- Cairo

  Cairo is the first production-grade platform for generating STARK proofs for general computation.
  Cairo comes with a single AIR (Algebraic Intermediate Representation) that can verify any Cairo program. With Cairo, new business logic doesn’t require a new smart contract, it only requires a different Cairo program. Consequently, the business logic and the proof system are clearly demarcated.
  Cairo programs are written in an assembly-like programming language (called, well, Cairo) that has the following features: memory, function calls, recursion, and branching conditions.
  https://medium.com/starkware/hello-cairo-3cb43b13b209

- Distaff

  Distaff is a zero-knowledge virtual machine written in Rust. For any program executed on Distaff VM, a STARK-based proof of execution is automatically generated. This proof can then be used by anyone to verify that a program was executed correctly without the need for re-executing the program or even knowing what the program was.
  https://github.com/guildofweavers/distaff

- Miden  
   Miden VM is a simple stack machine. This means all values live on the stack and all operations work with values near the top of the stack.
  Programs in Miden VM are structured as an execution graph of program blocks each consisting of a sequence of VM instructions.
  https://github.com/maticnetwork/miden/tree/main/miden

It looks like there are difference between programing languages.
For example, Zinc adopts reletively easy laguage while others adopt seemingly difficult languages.

## Question 2. Semaphore

### 1. What is Semaphore? Explain in brief how it works? What applications can be developed using Semaphore (mention 3-4)?

Semaphore is a library which helps developers develop Ethereum zk utilized DApps.
Using Semaphore, Developers don't need to write circuit code and setup ceremony which are very difficult for normal developers.

Private voting, whistleblowing, mixers, and anonymous authentication can be developed with Semaphore's help.

### 2-1. Run the tests and add a screenshot of all the test passing.

[screenshot of all the test passing](https://github.com/enu-kuro/zku-week2/blob/main/q2-2-1.png)

### 2-2. Explain code in the sempahore.circom file (including public, private inputs).

Semaphore circuits allow you to prove 3 things:

1, the identity commitment exists in the Merkle tree.

```
    component inclusionProof = MerkleTreeInclusionProof(nLevels);
    inclusionProof.leaf <== calculateIdentityCommitment.out;

    for (var i = 0; i < nLevels; i++) {
        inclusionProof.siblings[i] <== treeSiblings[i];
        inclusionProof.pathIndices[i] <== treePathIndices[i];
    }

    root <== inclusionProof.root;
```

2, the signal was only broadcasted once.
(Semaphore circuit itself doesn't prove "the signal was only broadcasted once" just proving
externalNullifier hasn't been tampered. So Smart Contracts have to prevent double-signalling using externalNullifier.)

```
    component calculateNullifierHash = CalculateNullifierHash();
    calculateNullifierHash.externalNullifier <== externalNullifier;
    calculateNullifierHash.identityNullifier <== identityNullifier;

    nullifierHash <== calculateNullifierHash.out;
```

3, the signal was truly broadcasted by the user who generated the proof.

```
    signal signalHashSquared;
    signalHashSquared <== signalHash * signalHash;
```

Private inputs:
identityNullifier: a random 32-byte value which the user should save,
identityTrapdoor: a random 32-byte value which the user should save,
treeSiblings[nLevels]: the values along the Merkle path to the user's identity commitment,
treePathIndices[nLevels]: the direction (0/1) per tree level corresponding to the Merkle path to the user's identity commitment.

Public inputs:
signalHash: the hash of the user's signal,
externalNullifier: the 32-byte external nullifier.

Referenced from: [circuits.md](https://github.com/appliedzkp/semaphore/blob/4e6be04729ed2d7e29461a3915877a66a2c9c4d2/docs/versioned_docs/version-V2/technical-reference/circuits.md)

### 3-1. What potential challenges are there to overcome in such an authentication system?

What problems will Elefria solve? About users privacy, big tech companies don't rely on login info for advertisement. Even if you don't login, companise know about you through user's behavior.
I'm not sure Elefria can solve these problems.

Every time I login, gas fee is required. It's unrealistuic in real usecase. And required gas means you can't use completly new account though relayers may fix this problem.

Elefria saves secrets in localStrage and token in Cookie. On this point, security level is not different from normal web2 auth.

## Question 3. Tornado Cash

### 1. Compare and contrast the circuits and contracts in the two repositories above (or consult this article), summarize the key improvements/upgrades from tornado-trees to tornado-nova in 100 words.

New Tornado Cash Nov pool allows users to deposit and withdraw arbitrary amounts of ETH while old version can't do.
Tornado Cash Nov provides the way to make shielded transfers of deposited tokens while staying within the pool while in old version users have to withdraw tokens first and then is able to transfer the custody of deposited funds.
And because Tornado Cash Nova uses the Gnosis Chain as a Layer2, users can benefit from cheaper fees, while still having fast transactions.

### 2-1. Take a look at the circuits/TreeUpdateArgsHasher.circom and contracts/TornadoTrees.sol. Explain the process to update the withdrawal tree (including public, private inputs to the circuit, arguments sent to the contract call, and the on-chain verification process).

There are 1 public input and 7 private inputs in circuit:

```
  signal input argsHash;
  signal private input oldRoot;
  signal private input newRoot;
  signal private input pathIndices;
  signal private input pathElements[height];
  signal private input hashes[nLeaves];
  signal private input instances[nLeaves];
  signal private input blocks[nLeaves];
```

In verifyProof porcess here, publc input is only one single hash called argsHash into which all private inputs(except pathElements) compressed. In this way you can reduce a gas cost.

PathElements are for verifying that batch subtree was inserted correctly.

Leaf's acutual value is Poseidon hash of instances address, blockNumber and hash(nullifierHash for withdrawalTree and commitment for depositTree according to tornadoTrees.test.js).

TreeUpdateArgsHasher calculates SHA256 hash of all inputs.
This output must match argsHash.

There are 6 arguments sent to the contract call:

```
  /// @param _proof A snark proof that elements were inserted correctly
  /// @param _argsHash A hash of snark inputs
  /// @param _currentRoot Current merkle tree root
  /// @param _newRoot Updated merkle tree root
  /// @param _pathIndices Merkle path to inserted batch
  /// @param _events A batch of inserted events (leaves)
```

\_events includes hashes, instances and blocks so contract can calculate argsHash and pass it to Verifier.

### 2-2. Why do you think we use the SHA256 hash here instead of the Poseidon hash used elsewhere?

Poseidon hash is Snark-friendly but not Smart Contract. Tornado cash team selected Smart Contract friendly hash because gas cost
is more critical while off chain cost can be acceptable.

### 3-1. Run the tests and add a screenshot of all the tests passing.

[screenshot of all the test passing](https://github.com/enu-kuro/zku-week2/blob/main/q3-3-1.png)

### 3-2. Add a script named custom.test.js under test/ and write a test for all of the followings in a single it function

[custom.test.js](https://github.com/enu-kuro/zku-week2/blob/main/custom.test.js)

## Question 4. Thinking In ZK

### 4-1. If you have a chance to meet with the people who built Tornado Cash & Semaphore, what questions would you ask them about their protocols?

This question is not only for Tornado cash but more general question for technically difficult projects.
It seeems that Tornado cash can update contract by TORN holders governance.
But I think its code is very difficutlt to understand for average developers so how many people actually understand what they are updating?
I feel I need to trust core developers for using tornado cash.
If few people understand its code, isn't it more like centralized governance?
How to maintain trustless and decentralized governance?

Mixer services can be regulated by authorities.
Even if any authorities can't stop smart contracts but paricipants would decrease because it's legally risky.
Tornado cash needs a lot of participants for maitaining anonimity.
Are there any solutions for this problem?
