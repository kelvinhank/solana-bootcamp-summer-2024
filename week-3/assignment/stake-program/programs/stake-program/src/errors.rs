use anchor_lang::prelude::*;

#[error_code]
pub enum AppError {
    #[msg("Over vault balance")]
    OverBalance,

    #[msg("Vault owner mismatch")]
    NotOwner,

    #[msg("Tokens are already staked")]
    IsStaked,

    #[msg("Tokens are not staked")]
    NotStaked,

    #[msg("No tokens to stake")]
    NoToken,
}
