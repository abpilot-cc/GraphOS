use bevy_app::prelude::*;
use bevy_ecs::prelude::*;
use nanoid::nanoid;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
// use tracing::info;
use std::collections::HashMap;

pub trait IVariant: Component {
    fn name() -> &'static str;
}

pub trait IEvent: Event {
    fn name() -> &'static str;
}

#[derive(Component, Debug, Clone, Serialize, Deserialize)]
pub struct Context {
    pub id: String,
    pub table: String,
    pub pid: Option<String>,
}

#[derive(Component)]
pub struct Restore;

#[derive(Event)]
pub struct Startup;

pub fn next_id() -> String {
    nanoid!()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Message {
    Spawn(Context),
    Despawn(Context),
    Change {
        id: String,
        name: String,
        table: String,
        value: serde_cbor::Value,
    },
    Event {
        r#type: String,
        payload: serde_cbor::Value,
    },
    Reset,
    Restore,
    Startup,
}

#[derive(Resource, Default)]
pub struct WorldResource {
    entitys: HashMap<String, Entity>,
    contexts: HashMap<Entity, Context>,
    variant_tables: HashMap<
        String,
        HashMap<String, Box<dyn Fn(&serde_cbor::Value, &mut Commands, Entity) + Send + Sync>>,
    >,
    events: HashMap<String, Box<dyn Fn(&serde_cbor::Value, &mut Commands) + Send + Sync>>,
    inbound: std::collections::VecDeque<Message>,
    outbound: std::collections::VecDeque<Message>,
    entity_variants: HashMap<String, HashMap<String, serde_cbor::Value>>,
    restore: bool,
}

impl WorldResource {
    pub fn send(&mut self, msg: Message) {
        self.inbound.push_back(msg.clone());
        self.outbound.push_back(msg);
    }

    pub fn recv(&mut self) -> Option<Message> {
        self.outbound.pop_front()
    }

    pub fn get_context(&self, id: &Entity) -> Option<&Context> {
        self.contexts.get(id)
    }

    pub fn get_entity(&self, id: &str) -> Option<&Entity> {
        self.entitys.get(id)
    }

    pub fn get_children(&self, parent_id: &str) -> Vec<&Entity> {
        let mut children = Vec::new();
        for (entity, context) in &self.contexts {
            if let Some(pid) = &context.pid {
                if pid == parent_id {
                    children.push(entity);
                }
            }
        }
        children
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, SystemSet)]
enum WorldSystemSet {
    Spawn,
    Change,
    Despawn,
}

pub fn reg(app: &mut App) {
    app.configure_sets(
        PostUpdate,
        (
            WorldSystemSet::Spawn,
            WorldSystemSet::Change,
            WorldSystemSet::Despawn,
        )
            .chain(),
    );
    app.insert_resource(WorldResource {
        entitys: HashMap::new(),
        contexts: HashMap::new(),
        variant_tables: HashMap::new(),
        events: HashMap::new(),
        inbound: std::collections::VecDeque::new(),
        outbound: std::collections::VecDeque::new(),
        entity_variants: HashMap::new(),
        restore: false,
    });
    app.add_systems(PreUpdate, on_update_system);
    app.add_systems(PostUpdate, on_spawn_system.in_set(WorldSystemSet::Spawn));
    app.add_systems(
        PostUpdate,
        on_despawn_system.in_set(WorldSystemSet::Despawn),
    );
}

pub fn reg_veriant<T>(app: &mut App, table: &str)
where
    T: IVariant + DeserializeOwned + Serialize + Send + Sync + 'static,
{
    let mut rs = app.world_mut().get_resource_mut::<WorldResource>().unwrap();
    let table_entry = rs
        .variant_tables
        .entry(table.to_string())
        .or_insert_with(HashMap::new);
    table_entry.insert(
        T::name().to_string(),
        Box::new(|data, commands, entity| {
            match serde_cbor::value::from_value::<T>(data.clone()) {
                Ok(variant) => {
                    commands.entity(entity).insert(variant);
                }
                Err(e) => {
                    println!("CBOR decode failed for variant {}: {}", T::name(), e);
                }
            };
        }),
    );
    app.add_systems(
        PostUpdate,
        on_change_system::<T>.in_set(WorldSystemSet::Change),
    );
}

pub fn reg_event<T>(app: &mut App)
where
    T: IEvent + Serialize + DeserializeOwned + Send + Sync + 'static,
    for<'a> <T as Event>::Trigger<'a>: Default,
{
    let mut rs = app.world_mut().get_resource_mut::<WorldResource>().unwrap();
    rs.events.insert(
        T::name().to_string(),
        Box::new(|data, commands| {
            match serde_cbor::value::from_value::<T>(data.clone()) {
                Ok(event) => commands.trigger(event),
                Err(e) => println!("CBOR decode failed for event {}: {}", T::name(), e),
            };
        }),
    );
    app.add_observer(on_event_system::<T>);
}

fn on_spawn_system(
    query: Query<(Entity, &Context), Added<Context>>,
    mut res: ResMut<WorldResource>,
) {
    for (entity, context) in query.iter() {
        res.entitys.insert(context.id.clone(), entity);
        res.contexts.insert(entity, context.clone());
        res.outbound.push_back(Message::Spawn(context.clone()));
    }
}

fn on_event_system<T>(trigger: On<T>, mut res: ResMut<WorldResource>)
where
    T: Event + IEvent + Serialize,
{
    let event = trigger.event();
    let value = match serde_cbor::value::to_value(event) {
        Ok(v) => v,
        Err(_) => return,
    };
    res.outbound.push_back(Message::Event {
        r#type: T::name().to_string(),
        payload: value,
    });
}

fn on_change_system<T>(query: Query<(&Context, &T), Changed<T>>, mut res: ResMut<WorldResource>)
where
    T: IVariant + DeserializeOwned + Serialize + Send + Sync + 'static,
{
    for (context, variant) in query.iter() {
        let value = match serde_cbor::value::to_value(variant) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let entity_variants = res
            .entity_variants
            .entry(context.id.clone())
            .or_insert_with(HashMap::new);
        let variant_name = T::name().to_string();
        if let Some(cached_value) = entity_variants.get(&variant_name) {
            if cached_value == &value {
                continue;
            }
        }
        entity_variants.insert(variant_name.clone(), value.clone());
        res.outbound.push_back(Message::Change {
            id: context.id.clone(),
            name: variant_name,
            table: context.table.clone(),
            value,
        });
    }
}

fn on_despawn_system(mut removed: RemovedComponents<Context>, mut res: ResMut<WorldResource>) {
    for entity in removed.read() {
        let context = if let Some(ctx) = res.contexts.get(&entity) {
            ctx.clone()
        } else {
            continue;
        };
        res.entitys.remove(&context.id);
        res.contexts.remove(&entity);
        res.entity_variants.remove(&context.id);
        res.outbound.push_back(Message::Despawn(context));
    }
}

fn on_update_system(mut res: ResMut<WorldResource>, mut commands: Commands) {
    while let Some(msg) = res.inbound.pop_front() {
        match &msg {
            Message::Spawn(context) => {
                println!("Spawning entity with context: {:?}", context);
                let entity = match res.restore {
                    true => commands.spawn((context.clone(), Restore)).id(),
                    false => commands.spawn((context.clone(),)).id(),
                };
                res.entitys.insert(context.id.clone(), entity);
                res.contexts.insert(entity, context.clone());
            }
            Message::Despawn(ctx) => {
                println!("Despawning entity with context: {:?}", ctx);
                if let Some(entity) = res.entitys.remove(&ctx.id) {
                    commands.entity(entity).despawn();
                    res.contexts.remove(&entity);
                } else {
                    println!(
                        "Entity with context ID '{}' not found for despawning",
                        ctx.id
                    );
                }
            }
            Message::Change {
                id,
                table,
                name,
                value,
            } => {
                println!("Changing entity {}: {} to {:?}", id, name, value);
                if let Some(entity) = res.entitys.get(id) {
                    if let Some(variants) = res.variant_tables.get(table) {
                        if let Some(spawn_fn) = variants.get(name) {
                            spawn_fn(&value, &mut commands, *entity);
                        } else {
                            println!("Variant name '{}' not found in table '{}'", name, table);
                        }
                    } else {
                        println!("Variant table '{}' not found", table);
                    }
                } else {
                    println!("Entity with ID '{}' not found for change", id);
                }
            }
            Message::Reset => {
                println!("Resetting world");
                for entity in res.entitys.values() {
                    commands.entity(*entity).despawn();
                }
                res.entitys.clear();
                res.contexts.clear();
                res.variant_tables.clear();
                res.inbound.clear();
                res.outbound.clear();
                res.restore = false;
            }
            Message::Event { r#type, payload } => {
                println!("Processing event of type '{}'", r#type);
                if let Some(event_fn) = res.events.get(r#type) {
                    event_fn(&payload, &mut commands);
                } else {
                    println!("Event type '{}' not found", r#type);
                }
            }
            Message::Restore => {
                println!("Restore world");
                res.restore = true;
            }
            Message::Startup => {
                println!("Startup world");
                commands.trigger(Startup);
            }
        }
    }
}
