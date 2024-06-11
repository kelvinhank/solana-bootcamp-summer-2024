import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {StakeProgram} from "../target/types/stake_program";
import {
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddressSync,
    createInitializeMint2Instruction,
    getMinimumBalanceForRentExemptMint,
    TOKEN_PROGRAM_ID,
    MINT_SIZE,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createMintToInstruction,
    getAccount,
} from "@solana/spl-token";
import {expect, assert} from "chai";
import {BN} from "bn.js";

const sleep = (ms: number) =>
    new Promise((resolve) =>
        setTimeout(() => resolve(ms), ms)
    )

describe("stake-program", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.StakeProgram as Program<StakeProgram>;

    const staker = anchor.web3.Keypair.generate();
    let stakerUSDCTokenAccount: anchor.web3.PublicKey,
        stakerUSDTTokenAccount: anchor.web3.PublicKey;

    // USDC-fake mint
    const usdcMintKp = anchor.web3.Keypair.generate();
    // USDT-fake mint
    const usdtMintKp = anchor.web3.Keypair.generate();
    let usdcRewardVault: anchor.web3.PublicKey,
        usdtRewardVault: anchor.web3.PublicKey,
        usdcStakeInfo: anchor.web3.PublicKey,
        usdtStakeInfo: anchor.web3.PublicKey;
    const usdcStakeAmount = new BN(100 * 10 ** 6),
        usdtStakeAmount = new BN(101 * 10 ** 6),
        usdtUnStakePortionAmount = new BN(50 * 10 ** 6),
        usdtUnStakeResAmount = new BN(51 * 10 ** 6);


    before(async () => {
        // init staker
        {
            await provider.connection.confirmTransaction(
                await provider.connection.requestAirdrop(
                    staker.publicKey,
                    anchor.web3.LAMPORTS_PER_SOL
                )
            );
        }
        // create USDC-fake mint
        {
            const tx = new anchor.web3.Transaction();

            const lamports = await getMinimumBalanceForRentExemptMint(
                provider.connection
            );

            const createMintIx = anchor.web3.SystemProgram.createAccount({
                fromPubkey: provider.publicKey,
                newAccountPubkey: usdcMintKp.publicKey,
                space: MINT_SIZE,
                lamports,
                programId: TOKEN_PROGRAM_ID,
            });

            const initMintIx = createInitializeMint2Instruction(
                usdcMintKp.publicKey,
                6,
                provider.publicKey,
                provider.publicKey,
                TOKEN_PROGRAM_ID
            );

            stakerUSDCTokenAccount = getAssociatedTokenAddressSync(
                usdcMintKp.publicKey,
                staker.publicKey
            );

            const createStakerTokenAccountIx =
                createAssociatedTokenAccountInstruction(
                    staker.publicKey,
                    stakerUSDCTokenAccount,
                    staker.publicKey,
                    usdcMintKp.publicKey
                );

            const mintToStakerIx = createMintToInstruction(
                usdcMintKp.publicKey,
                stakerUSDCTokenAccount,
                provider.publicKey,
                1000 * 10 ** 6,
                []
            );

            tx.add(
                ...[
                    createMintIx,
                    initMintIx,
                    createStakerTokenAccountIx,
                    mintToStakerIx,
                ]
            );

            const ts = await provider.sendAndConfirm(tx, [usdcMintKp, staker]);

            console.log("Create USDC transaction signature", ts);
        }

        // create USDT-fake mint
        {
            const tx = new anchor.web3.Transaction();

            const lamports = await getMinimumBalanceForRentExemptMint(
                provider.connection
            );

            const createMintIx = anchor.web3.SystemProgram.createAccount({
                fromPubkey: provider.publicKey,
                newAccountPubkey: usdtMintKp.publicKey,
                space: MINT_SIZE,
                lamports,
                programId: TOKEN_PROGRAM_ID,
            });

            const initMintIx = createInitializeMint2Instruction(
                usdtMintKp.publicKey,
                6,
                provider.publicKey,
                provider.publicKey,
                TOKEN_PROGRAM_ID
            );

            stakerUSDTTokenAccount = getAssociatedTokenAddressSync(
                usdtMintKp.publicKey,
                staker.publicKey
            );

            const createStakerTokenAccountIx =
                createAssociatedTokenAccountInstruction(
                    staker.publicKey,
                    stakerUSDTTokenAccount,
                    staker.publicKey,
                    usdtMintKp.publicKey
                );

            const mintToStakerIx = createMintToInstruction(
                usdtMintKp.publicKey,
                stakerUSDTTokenAccount,
                provider.publicKey,
                1000 * 10 ** 6,
                []
            );

            tx.add(
                ...[
                    createMintIx,
                    initMintIx,
                    createStakerTokenAccountIx,
                    mintToStakerIx,
                ]
            );

            const ts = await provider.sendAndConfirm(tx, [usdtMintKp, staker]);

            console.log("Create USDT transaction signature", ts);
        }

        usdcRewardVault = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("reward"), usdcMintKp.publicKey.toBuffer()],
            program.programId
        )[0];

        usdtRewardVault = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("reward"), usdtMintKp.publicKey.toBuffer()],
            program.programId
        )[0];
    });

    it("Is usdc initialized!", async () => {
        const tx = await program.methods
            .initialize()
            .accounts({
                admin: provider.publicKey,
                rewardVault: usdcRewardVault,
                mint: usdcMintKp.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        console.log("Your transaction signature", tx);

        const rewardVaultAccount = await getAccount(
            provider.connection,
            usdcRewardVault
        );

        expect(rewardVaultAccount.address.toBase58()).to.equal(
            usdcRewardVault.toBase58()
        );
        expect(Number(rewardVaultAccount.amount)).to.equal(0);
    });

    it("Is usdt initialized!", async () => {
        const tx = await program.methods
            .initialize()
            .accounts({
                admin: provider.publicKey,
                rewardVault: usdtRewardVault,
                mint: usdtMintKp.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        console.log("Your transaction signature", tx);

        const rewardVaultAccount = await getAccount(
            provider.connection,
            usdtRewardVault
        );

        expect(rewardVaultAccount.address.toBase58()).to.equal(
            usdtRewardVault.toBase58()
        );
        expect(Number(rewardVaultAccount.amount)).to.equal(0);
    });

    it("Stake USDC successfully", async () => {
        usdcStakeInfo = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("stake_info"), staker.publicKey.toBytes(), usdcMintKp.publicKey.toBuffer()],
            program.programId
        )[0];

        const vaultTokenAccount = getAssociatedTokenAddressSync(
            usdcMintKp.publicKey,
            usdcStakeInfo,
            true
        );

        const tx = await program.methods
            .stake(usdcStakeAmount)
            .accounts({
                staker: staker.publicKey,
                mint: usdcMintKp.publicKey,
                stakeInfo: usdcStakeInfo,
                vaultTokenAccount: vaultTokenAccount,
                stakerTokenAccount: stakerUSDCTokenAccount,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .signers([staker])
            .rpc();

        console.log("stake usdc transaction signature", tx);

        const stakeInfoAccount = await program.account.stakeInfo.fetch(usdcStakeInfo);

        expect(stakeInfoAccount.staker.toBase58()).to.equal(
            staker.publicKey.toBase58()
        );
        expect(stakeInfoAccount.mint.toBase58()).to.equal(
            usdcMintKp.publicKey.toBase58()
        );
        expect(stakeInfoAccount.isStaked).to.equal(true);
        expect(stakeInfoAccount.amount.toString()).to.equal(usdcStakeAmount.toString());

        const stakerAccount = await getAccount(
            provider.connection,
            stakerUSDCTokenAccount
        );

        const vaultAccount = await getAccount(
            provider.connection,
            vaultTokenAccount
        );

        expect(stakerAccount.amount.toString()).to.equal(String(900 * 10 ** 6));
        expect(vaultAccount.amount.toString()).to.equal(String(100 * 10 ** 6));
    });

    it("Stake USDT successfully", async () => {
        usdtStakeInfo = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("stake_info"), staker.publicKey.toBytes(), usdtMintKp.publicKey.toBuffer()],
            program.programId
        )[0];

        const vaultTokenAccount = getAssociatedTokenAddressSync(
            usdtMintKp.publicKey,
            usdtStakeInfo,
            true
        );

        const tx = await program.methods
            .stake(usdtStakeAmount)
            .accounts({
                staker: staker.publicKey,
                mint: usdtMintKp.publicKey,
                stakeInfo: usdtStakeInfo,
                vaultTokenAccount: vaultTokenAccount,
                stakerTokenAccount: stakerUSDTTokenAccount,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .signers([staker])
            .rpc();

        console.log("stake usdt transaction signature", tx);

        const stakeInfoAccount = await program.account.stakeInfo.fetch(usdtStakeInfo);

        expect(stakeInfoAccount.staker.toBase58()).to.equal(
            staker.publicKey.toBase58()
        );
        expect(stakeInfoAccount.mint.toBase58()).to.equal(
            usdtMintKp.publicKey.toBase58()
        );
        expect(stakeInfoAccount.isStaked).to.equal(true);
        expect(stakeInfoAccount.amount.toString()).to.equal(usdtStakeAmount.toString());

        const stakerAccount = await getAccount(
            provider.connection,
            stakerUSDTTokenAccount
        );

        const vaultAccount = await getAccount(
            provider.connection,
            vaultTokenAccount
        );

        expect(stakerAccount.amount.toString()).to.equal(String(899 * 10 ** 6));
        expect(vaultAccount.amount.toString()).to.equal(String(101 * 10 ** 6));
    });

    it("Unstake USDC successfully", async () => {
        await sleep(1000);
        // mint reward token to reward vault
        const mintTx = new anchor.web3.Transaction();

        const mintToRewardVaultIx = createMintToInstruction(
            usdcMintKp.publicKey,
            usdcRewardVault,
            provider.publicKey,
            1000 * 10 ** 6,
            []
        );

        mintTx.add(mintToRewardVaultIx);

        await provider.sendAndConfirm(mintTx);

        const vaultTokenAccount = getAssociatedTokenAddressSync(
            usdcMintKp.publicKey,
            usdcStakeInfo,
            true
        );

        const tx = await program.methods
            .unstake(usdcStakeAmount)
            .accounts({
                staker: staker.publicKey,
                mint: usdcMintKp.publicKey,
                stakeInfo: usdcStakeInfo,
                vaultTokenAccount: vaultTokenAccount,
                rewardVault: usdcRewardVault,
                stakerTokenAccount: stakerUSDCTokenAccount,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .signers([staker])
            .rpc();

        console.log("unstake usdc transaction signature", tx);

        try {
            await program.account.stakeInfo.fetch(usdcStakeInfo);
        } catch (err) {
            assert.strictEqual(err.message, `Account does not exist or has no data ${usdcStakeInfo.toString()}`);
        }

        try {
            await getAccount(
                provider.connection,
                vaultTokenAccount
            );
        } catch (err) {
            assert.strictEqual(err.message, ``);
        }

        const stakerAccount = await getAccount(
            provider.connection,
            stakerUSDCTokenAccount
        );

        const rewardVaultAccount = await getAccount(
            provider.connection,
            usdcRewardVault
        );

        expect(Number(stakerAccount.amount)).to.greaterThan(1000 * 10 ** 6);
        expect(Number(rewardVaultAccount.amount)).to.lessThan(1000 * 10 ** 6);
    });

    it("Unstake portion of USDT successfully", async () => {
        await sleep(1000);
        // mint reward token to reward vault
        const mintTx = new anchor.web3.Transaction();
        const mintToRewardVaultIx = createMintToInstruction(
            usdtMintKp.publicKey,
            usdtRewardVault,
            provider.publicKey,
            1000 * 10 ** 6,
            []
        );
        mintTx.add(mintToRewardVaultIx);
        await provider.sendAndConfirm(mintTx);

        const vaultTokenAccount = getAssociatedTokenAddressSync(
            usdtMintKp.publicKey,
            usdtStakeInfo,
            true
        );

        const tx = await program.methods
            .unstake(usdtUnStakePortionAmount)
            .accounts({
                staker: staker.publicKey,
                mint: usdtMintKp.publicKey,
                stakeInfo: usdtStakeInfo,
                vaultTokenAccount: vaultTokenAccount,
                rewardVault: usdtRewardVault,
                stakerTokenAccount: stakerUSDTTokenAccount,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .signers([staker])
            .rpc();

        console.log("unstake portion of usdt transaction signature", tx);

        const stakeInfoAccount = await program.account.stakeInfo.fetch(usdtStakeInfo);

        expect(stakeInfoAccount.isStaked).to.equal(true);
        expect(Number(stakeInfoAccount.amount)).to.lessThan(usdtStakeAmount.toNumber());

        const stakerAccount = await getAccount(
            provider.connection,
            stakerUSDTTokenAccount
        );

        const rewardVaultAccount = await getAccount(
            provider.connection,
            usdtRewardVault
        );

        const vaultAccount = await getAccount(
            provider.connection,
            vaultTokenAccount
        );

        expect(Number(stakerAccount.amount)).to.greaterThan(usdtUnStakePortionAmount.toNumber());
        expect(Number(vaultAccount.amount)).to.lessThan(usdtStakeAmount.toNumber());
        expect(Number(rewardVaultAccount.amount)).to.lessThan(1000 * 10 ** 6);
    });

    it("Unstake rest USDT successfully", async () => {
        await sleep(1000);

        const vaultTokenAccount = getAssociatedTokenAddressSync(
            usdtMintKp.publicKey,
            usdtStakeInfo,
            true
        );

        const tx = await program.methods
            .unstake(usdtUnStakeResAmount)
            .accounts({
                staker: staker.publicKey,
                mint: usdtMintKp.publicKey,
                stakeInfo: usdtStakeInfo,
                vaultTokenAccount: vaultTokenAccount,
                rewardVault: usdtRewardVault,
                stakerTokenAccount: stakerUSDTTokenAccount,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .signers([staker])
            .rpc();

        console.log("unstake usdt transaction signature", tx);

        try {
            await program.account.stakeInfo.fetch(usdtStakeInfo);
        } catch (err) {
            assert.strictEqual(err.message, `Account does not exist or has no data ${usdtStakeInfo.toString()}`);
        }

        try {
            await getAccount(
                provider.connection,
                vaultTokenAccount
            );
        } catch (err) {
            assert.strictEqual(err.message, ``);
        }

        const stakerAccount = await getAccount(
            provider.connection,
            stakerUSDTTokenAccount
        );

        const rewardVaultAccount = await getAccount(
            provider.connection,
            usdtRewardVault
        );

        expect(Number(stakerAccount.amount)).to.greaterThan(usdtStakeAmount.toNumber());
        expect(Number(rewardVaultAccount.amount)).to.lessThan(1000 * 10 ** 6);
    });
});