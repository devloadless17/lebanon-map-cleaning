/**
 * The team's operational grouping of Lebanon, as a starting point the owner can edit.
 *
 * This is NOT official geography and deliberately carries no boundaries — just names with
 * centre points. The centroid is what a booking routes to when a customer says only "Saida",
 * and the area is how the scheduler thinks ("you're already going to Tripoli Area") even when
 * two jobs are in different towns.
 */
export const PLANNING_AREAS = [
  {
    name: 'Beirut & Suburbs',
    colorToken: 'indigo',
    description: 'The capital and its immediate coastal and hill suburbs.',
    localities: [
      { name: 'Beirut', latitude: 33.8938, longitude: 35.5018 },
      { name: 'Khalde', latitude: 33.81, longitude: 35.49 },
      { name: 'Damour', latitude: 33.7261, longitude: 35.4525 },
      { name: 'Aley', latitude: 33.8106, longitude: 35.5972 },
      { name: 'Broummana', latitude: 33.8828, longitude: 35.6431 },
    ],
  },
  {
    name: 'Jounieh & Coast',
    colorToken: 'sky',
    description: 'The coastal road north of Beirut as far as Batroun.',
    localities: [
      { name: 'Jounieh', latitude: 33.9808, longitude: 35.6178 },
      { name: 'Jbeil', latitude: 34.123, longitude: 35.6519 },
      { name: 'Batroun', latitude: 34.2553, longitude: 35.6581 },
    ],
  },
  {
    name: 'Tripoli Area',
    colorToken: 'amber',
    description: 'Tripoli and the surrounding Koura towns, worked as one trip.',
    localities: [
      { name: 'Tripoli', latitude: 34.4367, longitude: 35.8497 },
      { name: 'Mina', latitude: 34.452, longitude: 35.82 },
      { name: 'Anfeh', latitude: 34.35, longitude: 35.73 },
      { name: 'Koura', latitude: 34.3, longitude: 35.81 },
    ],
  },
  {
    name: 'Saida Area',
    colorToken: 'emerald',
    description: 'Saida and the southern coast.',
    localities: [
      { name: 'Saida', latitude: 33.5571, longitude: 35.3729 },
      { name: 'Jiyeh', latitude: 33.6564, longitude: 35.4189 },
    ],
  },
  {
    name: 'Nabatieh & South',
    colorToken: 'rose',
    description: 'The southern inland towns and Tyre.',
    localities: [
      { name: 'Nabatieh', latitude: 33.3789, longitude: 35.4839 },
      { name: 'Tyre', latitude: 33.2704, longitude: 35.2038 },
    ],
  },
  {
    name: 'Bekaa',
    colorToken: 'violet',
    description: 'Over the mountains: Zahle and Baalbek.',
    localities: [
      { name: 'Zahle', latitude: 33.8463, longitude: 35.902 },
      { name: 'Baalbek', latitude: 34.0058, longitude: 36.2181 },
    ],
  },
] as const;

export const DEFAULT_DEPOT = {
  label: 'Beirut — Depot',
  latitude: 33.8938,
  longitude: 35.5018,
} as const;
