// Materials that refill on their own (farm buildings, Sawmill, daily resets), so
// Craftworks lines made only from these keep running without a farming trip.
export const PASSIVE_INPUTS = new Set(['Wood', 'Oak', 'Stone', 'Nails', 'Straw', 'Iron', 'Worms', 'Grubs', 'Minnows']);

// Made from rare drops (Amber, Runestones), so not worth a Craftworks slot
export const CRAFTWORKS_SKIP = new Set(['Amber Cane', 'Inferno Sphere', 'Lava Sphere']);
