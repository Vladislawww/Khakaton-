// Fake data for the Lumora support API. Everything is fictional and regenerated on every boot / reset,
// with lesson times relative to "now" so the edge cases (e.g. a lesson < 24h away) always hold.
//
// Edge cases the spec asks for:
//   - lesson less than 24h away ......... les_3201 (Lily, starts in ~5 hours)          -> TOO_LATE
//   - tutor with no free slots ........... tut_02 Leo Brandt (no open availability)    -> TUTOR_UNAVAILABLE / no alternatives
//   - already-cancelled subscription ..... acc_1005 Emma Rossi                         -> ALREADY_CANCELLED
//   - unverified account ................. acc_1002 Ben Carter                         -> IDENTITY_NOT_VERIFIED until verified
// Plus a taken slot: les_3104 (Ada, Nia Okoro) blocks Nia at that time, so moving Max's les_3002 there -> SLOT_UNAVAILABLE.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// A UTC time `days` from today at `hour`:`minute`.
function at(now, days, hour, minute = 0) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + days * DAY + hour * HOUR + minute * 60000);
}

// Weekly availability in UTC: weekday (0 = Sunday) -> list of [startHour, endHour).
const WEEKDAYS_AFTERNOON = { 1: [[13, 20]], 2: [[13, 20]], 3: [[13, 20]], 4: [[13, 20]], 5: [[13, 20]], 6: [[8, 12]] };

export function buildSeed(now = new Date()) {
  const tutors = [
    { id: 'tut_01', name: 'Nia Okoro',      subjects: ['math'],    rating: 4.9, availability: WEEKDAYS_AFTERNOON },
    { id: 'tut_02', name: 'Leo Brandt',     subjects: ['math'],    rating: 4.8, availability: {} },  // fully booked: no free slots
    { id: 'tut_03', name: 'Priya Venkat',   subjects: ['math'],    rating: 5.0, availability: { 1: [[15, 19]], 3: [[15, 19]], 5: [[15, 19]] } },
    { id: 'tut_04', name: 'Ella Hart',      subjects: ['reading'], rating: 4.9, availability: WEEKDAYS_AFTERNOON },
    { id: 'tut_05', name: 'Samuel Adeyemi', subjects: ['reading'], rating: 4.8, availability: { 2: [[14, 20]], 4: [[14, 20]], 6: [[9, 13]] } },
  ];

  const accounts = [
    {
      id: 'acc_1001', parent_name: 'Anna Kovalenko', email: 'anna.kovalenko@example.com', preferred_language: 'uk', verified: true,
      subscription: { plan: '6-month plan, 2 lessons/week', status: 'active', price: { amount: 184.0, currency: 'USD', interval: 'month' },
        period_start: at(now, -9, 0), next_billing_date: at(now, 21, 0), last_payment: 184.0 },
    },
    {
      id: 'acc_1002', parent_name: 'Ben Carter', email: 'ben.carter@example.com', preferred_language: 'en', verified: false,
      subscription: { plan: '3-month plan, 1 lesson/week', status: 'active', price: { amount: 104.0, currency: 'USD', interval: 'month' },
        period_start: at(now, -21, 0), next_billing_date: at(now, 9, 0), last_payment: 104.0 },
    },
    {
      id: 'acc_1003', parent_name: 'Chloe Nguyen', email: 'chloe.nguyen@example.com', preferred_language: 'es', verified: true,
      subscription: { plan: '12-month plan, 2 lessons/week', status: 'past_due', price: { amount: 152.0, currency: 'USD', interval: 'month' },
        period_start: at(now, -31, 0), next_billing_date: at(now, -1, 0), last_payment: 152.0 },
    },
    {
      id: 'acc_1004', parent_name: 'David Okafor', email: 'david.okafor@example.com', preferred_language: 'en', verified: true,
      subscription: { plan: '6-month plan, math + reading, 3 lessons/week', status: 'active', price: { amount: 252.0, currency: 'USD', interval: 'month' },
        period_start: at(now, -20, 0), next_billing_date: at(now, 10, 0), last_payment: 252.0 },
    },
    {
      id: 'acc_1005', parent_name: 'Emma Rossi', email: 'emma.rossi@example.com', preferred_language: 'it', verified: true,
      subscription: { plan: '3-month plan, 1 lesson/week', status: 'cancelled', price: { amount: 104.0, currency: 'USD', interval: 'month' },
        period_start: at(now, -40, 0), next_billing_date: null, last_payment: 104.0, cancelled_at: at(now, -12, 10), cancel_reason: 'Moving abroad' },
    },
  ];

  const children = [
    { id: 'ch_2001', account_id: 'acc_1001', name: 'Max',   grade: '4', subject: 'math',    regular_tutor_id: 'tut_01' },
    { id: 'ch_2002', account_id: 'acc_1002', name: 'Sofia', grade: '7', subject: 'math',    regular_tutor_id: 'tut_02' },
    { id: 'ch_2003', account_id: 'acc_1003', name: 'Lily',  grade: '1', subject: 'reading', regular_tutor_id: 'tut_04' },
    { id: 'ch_2004', account_id: 'acc_1004', name: 'Ada',   grade: '5', subject: 'math',    regular_tutor_id: 'tut_01' },
    { id: 'ch_2005', account_id: 'acc_1004', name: 'Sam',   grade: '2', subject: 'reading', regular_tutor_id: 'tut_05' },
    { id: 'ch_2006', account_id: 'acc_1005', name: 'Luca',  grade: '3', subject: 'math',    regular_tutor_id: 'tut_03' },
  ];

  const L = (id, child_id, tutor_id, start, duration_min, status, topic, extra = {}) =>
    ({ id, child_id, tutor_id, start, duration_min, status, topic, tutor_note: null, progress_rating: null, ...extra });

  const lessons = [
    // Max (Anna): two done, three upcoming with Nia
    L('les_3001', 'ch_2001', 'tut_01', at(now, -5, 16), 50, 'completed', 'Equivalent fractions', { tutor_note: 'Solid on equivalent fractions; next up is comparing them.', progress_rating: 4 }),
    L('les_3000', 'ch_2001', 'tut_01', at(now, -2, 16), 50, 'completed', 'Comparing fractions', { tutor_note: 'Used pizza models; great focus today.', progress_rating: 5 }),
    L('les_3002', 'ch_2001', 'tut_01', at(now, 3, 16), 50, 'scheduled', 'Adding fractions with like denominators'),
    L('les_3003', 'ch_2001', 'tut_01', at(now, 5, 16), 50, 'scheduled', 'Fraction word problems'),
    L('les_3004', 'ch_2001', 'tut_01', at(now, 10, 16), 50, 'scheduled', 'Decimals intro'),
    // Sofia (Ben): Leo is fully booked
    L('les_3101', 'ch_2002', 'tut_02', at(now, -6, 17), 50, 'missed', 'Solving one-step equations', { tutor_note: 'Student did not join.' }),
    L('les_3102', 'ch_2002', 'tut_02', at(now, 4, 17), 50, 'scheduled', 'Two-step equations'),
    L('les_3103', 'ch_2002', 'tut_02', at(now, 11, 17), 50, 'scheduled', 'Inequalities'),
    // Ada (David): math with Nia; les_3104 occupies Nia at day+4 16:00
    L('les_3104', 'ch_2004', 'tut_01', at(now, 4, 16), 50, 'scheduled', 'Multiplying decimals'),
    L('les_3105', 'ch_2004', 'tut_01', at(now, -3, 16), 50, 'completed', 'Decimal place value', { tutor_note: 'Confident with tenths and hundredths.', progress_rating: 4 }),
    // Sam (David): reading with Samuel
    L('les_3106', 'ch_2005', 'tut_05', at(now, 2, 15), 50, 'scheduled', 'Reading aloud with expression'),
    L('les_3107', 'ch_2005', 'tut_05', at(now, -4, 15), 50, 'cancelled', 'Story retelling'),
    // Lily (Chloe): one lesson starts in about 5 hours (edge case: < 24h)
    L('les_3200', 'ch_2003', 'tut_04', at(now, -3, 15), 30, 'completed', 'Short-vowel blends', { tutor_note: 'Blends are getting smoother.', progress_rating: 3 }),
    L('les_3201', 'ch_2003', 'tut_04', new Date(Math.ceil((now.getTime() + 5 * HOUR) / (30 * 60000)) * 30 * 60000), 30, 'scheduled', 'Sight words set 4'),
    L('les_3202', 'ch_2003', 'tut_04', at(now, 6, 15), 30, 'scheduled', 'Reading a short story'),
    // Luca (Emma, cancelled): history only
    L('les_3300', 'ch_2006', 'tut_03', at(now, -15, 15), 50, 'completed', 'Times tables 6-9', { tutor_note: 'Quick recall improving.', progress_rating: 4 }),
  ];

  return { tutors, accounts, children, lessons };
}
