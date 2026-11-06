/**
 * What can be logged about a day, besides what was written about it.
 *
 * Short lists, on purpose. Every option here is a chip somebody has to read
 * past to find the one they want, and a log screen with forty of them becomes
 * a form nobody fills in. These are the things that change from day to day and
 * that are worth seeing over months.
 *
 * Weight is deliberately absent. It is the one thing a period tracker usually
 * asks for that this app will not: a diary should be the last place on the
 * phone that hands somebody a number about her body every morning.
 *
 * Icons are names from MaterialCommunityIcons, which ships inside Expo Go.
 */

export interface LogOption<Id extends string = string> {
  id: Id;
  label: string;
  icon: string;
}

export const FLOWS = [
  { id: 'spotting', label: 'Spotting', icon: 'water-outline' },
  { id: 'light', label: 'Light', icon: 'water' },
  { id: 'medium', label: 'Medium', icon: 'water-plus' },
  { id: 'heavy', label: 'Heavy', icon: 'waves' },
] as const satisfies readonly LogOption[];

export type FlowId = (typeof FLOWS)[number]['id'];

/** Spotting is logged, but it is not the first day of a period. */
export function flowMeansPeriod(flow: FlowId | undefined): boolean {
  return flow === 'light' || flow === 'medium' || flow === 'heavy';
}

export const SYMPTOMS = [
  { id: 'none', label: 'Nothing to note', icon: 'check-circle-outline' },
  { id: 'cramps', label: 'Cramps', icon: 'lightning-bolt-outline' },
  { id: 'tender-breasts', label: 'Tender breasts', icon: 'heart-outline' },
  { id: 'headache', label: 'Headache', icon: 'head-flash-outline' },
  { id: 'bloating', label: 'Bloating', icon: 'circle-double' },
  { id: 'backache', label: 'Backache', icon: 'human-handsdown' },
  { id: 'acne', label: 'Spots', icon: 'dots-hexagon' },
  { id: 'fatigue', label: 'Tired', icon: 'sleep' },
  { id: 'cravings', label: 'Cravings', icon: 'cupcake' },
  { id: 'insomnia', label: 'Couldn’t sleep', icon: 'weather-night' },
  { id: 'nausea', label: 'Nausea', icon: 'emoticon-sick-outline' },
  { id: 'gut', label: 'Upset stomach', icon: 'stomach' },
] as const satisfies readonly LogOption[];

export type SymptomId = (typeof SYMPTOMS)[number]['id'];

export const ENERGY = [
  { id: 'drained', label: 'Drained', icon: 'battery-10' },
  { id: 'low', label: 'Low', icon: 'battery-30' },
  { id: 'steady', label: 'Steady', icon: 'battery-60' },
  { id: 'high', label: 'Full of it', icon: 'battery-high' },
] as const satisfies readonly LogOption[];

export type EnergyId = (typeof ENERGY)[number]['id'];

export const INTIMACY = [
  { id: 'none', label: 'None', icon: 'minus-circle-outline' },
  { id: 'protected', label: 'Protected', icon: 'shield-check-outline' },
  { id: 'unprotected', label: 'Unprotected', icon: 'shield-off-outline' },
  { id: 'high-drive', label: 'High drive', icon: 'fire' },
  { id: 'low-drive', label: 'Low drive', icon: 'snowflake' },
] as const satisfies readonly LogOption[];

export type IntimacyId = (typeof INTIMACY)[number]['id'];

export const DISCHARGE = [
  { id: 'none', label: 'None', icon: 'minus-circle-outline' },
  { id: 'sticky', label: 'Sticky', icon: 'water-opacity' },
  { id: 'creamy', label: 'Creamy', icon: 'cup-outline' },
  { id: 'watery', label: 'Watery', icon: 'water-outline' },
  { id: 'egg-white', label: 'Egg white', icon: 'egg-outline' },
  { id: 'unusual', label: 'Unusual for me', icon: 'alert-circle-outline' },
] as const satisfies readonly LogOption[];

export type DischargeId = (typeof DISCHARGE)[number]['id'];

export const PILL = [
  { id: 'taken', label: 'Taken', icon: 'pill' },
  { id: 'missed', label: 'Missed', icon: 'pill-off' },
] as const satisfies readonly LogOption[];

export type PillId = (typeof PILL)[number]['id'];

/** The label for an id in any of the lists above. Unknown ids read as-is. */
export function labelFor(options: readonly LogOption[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? id;
}
