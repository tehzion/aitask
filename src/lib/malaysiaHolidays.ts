export type HolidayCategory = 'national' | 'religious' | 'cultural' | 'federal';

export interface MalaysiaHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  category: HolidayCategory;
}

/** Malaysia National Public Holidays — 2025 & 2026 (Federal / nationwide) */
export const MALAYSIA_HOLIDAYS: MalaysiaHoliday[] = [
  // ── 2025 ──────────────────────────────────────────────────────────
  { date: '2025-01-01', name: "New Year's Day", category: 'national' },
  { date: '2025-01-29', name: 'Chinese New Year', category: 'cultural' },
  { date: '2025-01-30', name: 'Chinese New Year (Day 2)', category: 'cultural' },
  { date: '2025-02-01', name: 'Federal Territory Day', category: 'federal' },
  { date: '2025-02-11', name: 'Thaipusam', category: 'religious' },
  { date: '2025-03-18', name: 'Nuzul Al-Quran', category: 'religious' },
  { date: '2025-03-31', name: 'Hari Raya Aidilfitri', category: 'religious' },
  { date: '2025-04-01', name: 'Hari Raya Aidilfitri (Day 2)', category: 'religious' },
  { date: '2025-04-18', name: 'Good Friday', category: 'religious' },
  { date: '2025-05-01', name: 'Labour Day', category: 'national' },
  { date: '2025-05-12', name: 'Wesak Day', category: 'religious' },
  { date: '2025-06-02', name: "Yang di-Pertuan Agong's Birthday", category: 'national' },
  { date: '2025-06-07', name: 'Hari Raya Haji', category: 'religious' },
  { date: '2025-06-27', name: 'Awal Muharram', category: 'religious' },
  { date: '2025-08-31', name: 'National Day (Merdeka)', category: 'national' },
  { date: '2025-09-05', name: "Maulidur Rasul (Prophet's Birthday)", category: 'religious' },
  { date: '2025-09-16', name: 'Malaysia Day', category: 'national' },
  { date: '2025-10-20', name: 'Deepavali', category: 'religious' },
  { date: '2025-12-25', name: 'Christmas Day', category: 'religious' },

  // ── 2026 ──────────────────────────────────────────────────────────
  { date: '2026-01-01', name: "New Year's Day", category: 'national' },
  { date: '2026-02-01', name: 'Federal Territory Day / Thaipusam', category: 'federal' },
  { date: '2026-02-17', name: 'Chinese New Year', category: 'cultural' },
  { date: '2026-02-18', name: 'Chinese New Year (Day 2)', category: 'cultural' },
  { date: '2026-03-07', name: 'Nuzul Al-Quran', category: 'religious' },
  { date: '2026-03-21', name: 'Hari Raya Aidilfitri', category: 'religious' },
  { date: '2026-03-22', name: 'Hari Raya Aidilfitri (Day 2)', category: 'religious' },
  { date: '2026-04-03', name: 'Good Friday', category: 'religious' },
  { date: '2026-05-01', name: 'Labour Day', category: 'national' },
  { date: '2026-05-27', name: 'Hari Raya Haji', category: 'religious' },
  { date: '2026-05-31', name: 'Wesak Day', category: 'religious' },
  { date: '2026-06-01', name: "Yang di-Pertuan Agong's Birthday", category: 'national' },
  { date: '2026-06-17', name: 'Awal Muharram', category: 'religious' },
  { date: '2026-08-25', name: "Maulidur Rasul (Prophet's Birthday)", category: 'religious' },
  { date: '2026-08-31', name: 'National Day (Merdeka)', category: 'national' },
  { date: '2026-09-16', name: 'Malaysia Day', category: 'national' },
  { date: '2026-11-08', name: 'Deepavali', category: 'religious' },
  { date: '2026-12-25', name: 'Christmas Day', category: 'religious' },
];

/** Look up holidays for a given date string (YYYY-MM-DD) */
export const getHolidaysForDate = (dateStr: string): MalaysiaHoliday[] =>
  MALAYSIA_HOLIDAYS.filter(h => h.date === dateStr);

/** Category → Tailwind color classes */
export const HOLIDAY_COLORS: Record<HolidayCategory, { bg: string; text: string; dot: string; badge: string }> = {
  national:  { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200' },
  religious: { bg: 'bg-teal-50',   text: 'text-teal-700',   dot: 'bg-teal-500',   badge: 'bg-teal-100 text-teal-700 border-teal-200' },
  cultural:  { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  federal:   { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700 border-purple-200' },
};
