use crate::contants::{REWARD_VAULT_SEED, STAKE_INFO_SEED};
use crate::errors::AppError;
use crate::state::StakeInfo;
use anchor_lang::__private::CLOSED_ACCOUNT_DISCRIMINATOR;
use anchor_lang::prelude::*;
use anchor_spl::token::Transfer;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount},
};
use std::io::{Cursor, Write};
use std::ops::DerefMut;

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>, // What happens if the staker provided is not the original creator of the stake information?

    pub mint: Account<'info, Mint>, // What happens if the provided mint address does not match the mint address in the stake information?

    #[account(
        mut,
        has_one = mint,
        constraint = stake_info.staker == staker.key() @ AppError::NotOwner
    )]
    pub stake_info: Account<'info, StakeInfo>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = stake_info,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [REWARD_VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = reward_vault,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = staker,
    )]
    pub staker_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
    const DENUMERATOR: u64 = 100_000;
    const NUMERATOR: u64 = 1_000; // aka 1%

    let stake_info = &mut ctx.accounts.stake_info;

    if !stake_info.is_staked {
        return Err(AppError::NotStaked.into());
    }
    if amount > stake_info.amount {
        return Err(AppError::OverBalance.into());
    }

    let clock = Clock::get()?;

    let slot_passed = clock.slot - stake_info.stake_at;

    let stake_amount = stake_info.amount;

    let reward_amount_per_slot = stake_amount
        .checked_mul(NUMERATOR)
        .and_then(|res| res.checked_div(DENUMERATOR))
        .unwrap();

    let reward = slot_passed.checked_mul(reward_amount_per_slot).unwrap(); // Handling potential overflow

    msg!("reward: {}", reward);

    // prevent data precision
    stake_info.stake_at = clock.slot;
    stake_info.amount -= amount;

    if reward > 0 {
        // transfer reward to staker
        let reward_vault_bump = ctx.bumps.reward_vault;
        let mint = ctx.accounts.mint.key();
        let reward_vault_signer_seeds: &[&[&[u8]]] =
            &[&[REWARD_VAULT_SEED, mint.as_ref(), &[reward_vault_bump]]];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.reward_vault.to_account_info(),
                    to: ctx.accounts.staker_token_account.to_account_info(),
                    authority: ctx.accounts.reward_vault.to_account_info(),
                },
                reward_vault_signer_seeds,
            ),
            reward,
        )?;
    }

    // transfer token from vault to staker
    let stake_info_bump = stake_info.bump;
    let staker_key = ctx.accounts.staker.key();
    let mint_key = ctx.accounts.mint.key();
    let stake_info_signer_seeds: &[&[&[u8]]] = &[&[
        STAKE_INFO_SEED,
        staker_key.as_ref(),
        mint_key.as_ref(),
        &[stake_info_bump],
    ]];

    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.staker_token_account.to_account_info(),
                authority: stake_info.to_account_info(),
            },
            stake_info_signer_seeds,
        ),
        amount,
    )?;

    if stake_info.amount == 0 {
        stake_info.is_staked = false;

        // close staker vault token account
        anchor_spl::token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: ctx.accounts.vault_token_account.to_account_info(),
                destination: ctx.accounts.staker.to_account_info(),
                authority: ctx.accounts.stake_info.to_account_info(),
            },
            stake_info_signer_seeds,
        ))?;

        // close staker staker_info account
        let dest_starting_lamports = ctx.accounts.staker.lamports();
        let need_to_close_account = ctx.accounts.stake_info.to_account_info();
        **ctx.accounts.staker.lamports.borrow_mut() = dest_starting_lamports
            .checked_add(need_to_close_account.lamports())
            .unwrap();
        **need_to_close_account.lamports.borrow_mut() = 0;

        let mut data = need_to_close_account.try_borrow_mut_data()?;
        for byte in data.deref_mut().iter_mut() {
            *byte = 0;
        }

        let dst: &mut [u8] = &mut data;
        let mut cursor = Cursor::new(dst);
        cursor.write_all(&CLOSED_ACCOUNT_DISCRIMINATOR).unwrap();
    }

    Ok(())
}
