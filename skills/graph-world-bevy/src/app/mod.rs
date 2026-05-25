use bevy_app::prelude::*;

pub mod game_system;
pub mod start_game_system;
pub mod world_bootstrap_system;

pub fn reg(app: &mut App) {
    world_bootstrap_system::reg(app);
    game_system::reg(app);
    start_game_system::reg(app);
}
