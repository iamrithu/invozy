import type { AgeingBucket } from '@/actions/reports';

/** The receivables ageing buckets, in order, with their chart colours.
 *
 * Ageing is an ordered scale, so it's one hue getting heavier with lateness
 * (the fixed --red family, which doesn't follow the company's brand colour)
 * — with "Not due" a neutral grey, since money not yet due isn't a problem.
 * The four red steps were checked as an ordinal ramp (monotone lightness,
 * visible gaps, lightest step ≥ 2:1 against the card) separately for each
 * theme: dark mode runs the other way round, light-to-bright, so the worst
 * bucket is still the one that stands out. Text on each block is white or
 * near-black, whichever has the stronger APCA contrast on that fill. Class
 * names are spelled out in full so Tailwind's scanner picks them up. */
export const AGEING: { key: AgeingBucket; label: string; short: string; fill: string; ink: string }[] = [
  { key: 'notDue', label: 'Not due', short: 'Not due', fill: 'bg-[hsl(0_0%_80%)] dark:bg-[hsl(0_0%_38%)]', ink: 'text-[#1c1c1c] dark:text-white' },
  { key: 'd1to30', label: '1–30 days', short: '1–30', fill: 'bg-[hsl(356_80%_76%)] dark:bg-[hsl(356_45%_40%)]', ink: 'text-[#1c1c1c] dark:text-white' },
  { key: 'd31to60', label: '31–60 days', short: '31–60', fill: 'bg-[hsl(356_75%_64%)] dark:bg-[hsl(356_62%_52%)]', ink: 'text-white' },
  { key: 'd61to90', label: '61–90 days', short: '61–90', fill: 'bg-[hsl(356_75%_53%)] dark:bg-[hsl(356_78%_62%)]', ink: 'text-white' },
  { key: 'd90plus', label: 'Over 90 days', short: '90+', fill: 'bg-[hsl(356_72%_40%)] dark:bg-[hsl(356_90%_76%)]', ink: 'text-white dark:text-[#1c1c1c]' },
];
