import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `+91${digits}` : phone.trim()
}

function authEmailForPhone(phone) {
  return `${normalizePhone(phone).replace(/\D/g, '')}@login.dharmamotors.local`
}

export async function signInWithPhone(phone, password) {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase.auth.signInWithPassword({ email: authEmailForPhone(phone), password })
}

export async function signUpWithPhone({ name, phone, password, referralCode }) {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase.auth.signUp({
    email: authEmailForPhone(phone),
    password,
    options: { data: { full_name: name, phone: normalizePhone(phone), referral_code: referralCode?.replace(/[^a-z0-9]/gi, '').toUpperCase() || null } },
  })
}

export async function validateReferralCode(referralCode) {
  const code = referralCode?.trim().toUpperCase()
  if (!code) return { valid: true }
  const { data, error } = await supabase.rpc('validate_referral_code', { code })
  return { valid: Boolean(data), error }
}

export async function getProfile(userId) {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase.from('profiles').select('id, full_name, phone, role, referral_code, points').eq('id', userId).single()
}

export async function getCustomerData(userId) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const [vehicles, bookings, bills, rewards, slots, workshop, claims] = await Promise.all([
    supabase.from('vehicles').select('id, model_name, type, fuel').eq('customer_id', userId).order('created_at', { ascending: false }),
    supabase.from('bookings').select('id, appointment_date, problem, status, vehicles(model_name, type, fuel), time_slots(label)').eq('customer_id', userId).order('appointment_date', { ascending: true }),
    supabase.from('bills').select('id, created_at, work_done, total, status').eq('customer_id', userId).order('created_at', { ascending: false }),
    supabase.from('rewards').select('id, name, description, points_required').eq('enabled', true).order('points_required', { ascending: true }),
    supabase.from('time_slots').select('id, label, max_bookings').eq('enabled', true).order('label'),
    supabase.from('workshop_settings').select('appointments_open').eq('id', true).single(),
    supabase.from('reward_claims').select('id, reward_id, status, created_at, rewards(name, points_required)').eq('customer_id', userId).order('created_at', { ascending: false }),
  ])
  const failed = [vehicles, bookings, bills, rewards, slots, workshop, claims].find(result => result.error)
  if (failed) throw failed.error
  return {
    vehicles: vehicles.data || [],
    bookings: (bookings.data || []).map(booking => ({
      ...booking,
      status: booking.status[0].toUpperCase() + booking.status.slice(1),
      customer: 'My appointment',
      initials: 'ME',
      vehicle: booking.vehicles?.model_name || 'Vehicle',
      issue: booking.problem,
      date: `${new Date(booking.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ${booking.time_slots?.label || 'Time pending'}`,
      tone: 'blue',
    })),
    bills: (bills.data || []).map(bill => ({
      ...bill,
      customer: 'My bill',
      service: bill.work_done,
      date: new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      amount: Number(bill.total || 0),
      status: bill.status === 'paid' ? 'Paid' : 'Pending',
    })),
    rewards: rewards.data || [],
    slots: slots.data || [],
    appointmentsOpen: workshop.data?.appointments_open ?? true,
    claims: claims.data || [],
  }
}

export async function createVehicle(customerId, vehicle) {
  return supabase.from('vehicles').insert({ customer_id: customerId, ...vehicle }).select('id, model_name, type, fuel').single()
}

export async function createBooking(customerId, booking) {
  return supabase.from('bookings').insert({ customer_id: customerId, ...booking }).select('id, appointment_date, problem, status').single()
}

export async function getAvailableSlots(date) {
  const { data: available, error } = await supabase.from('time_slots').select('id, label, max_bookings').eq('enabled', true).order('label')
  if (error) return { data: null, error }
  const { data: booked, error: bookingError } = await supabase.from('bookings').select('slot_id').eq('appointment_date', date).neq('status', 'cancelled')
  if (bookingError) return { data: null, error: bookingError }
  const counts = (booked || []).reduce((result, item) => ({ ...result, [item.slot_id]: (result[item.slot_id] || 0) + 1 }), {})
  return { data: (available || []).filter(slot => (counts[slot.id] || 0) < slot.max_bookings), error: null }
}

export async function getAdminData() {
  const [bookings, jobs, bills, customers, profiles, referralEvents, rewards, slots, workshop, claims] = await Promise.all([
    supabase.from('bookings').select('id, appointment_date, problem, status, profiles(full_name, phone), vehicles(model_name), time_slots(label)').order('appointment_date', { ascending: true }),
    supabase.from('jobs').select('id, booking_id, customer_id, problem, status, profiles(full_name, phone, referred_by), vehicles(model_name), created_at').order('created_at', { ascending: false }),
    supabase.from('bills').select('id, customer_id, work_done, total, status, created_at, profiles(full_name)').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, phone, points, referred_by, created_at').eq('role', 'customer').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('referral_bonus_events').select('referred_customer_id'),
    supabase.from('rewards').select('id, name, description, points_required, enabled').order('points_required'),
    supabase.from('time_slots').select('id, label, max_bookings, enabled').order('label'),
    supabase.from('workshop_settings').select('appointments_open').eq('id', true).single(),
    supabase.from('reward_claims').select('id, status, created_at, profiles(full_name), rewards(name, points_required)').order('created_at', { ascending: false }),
  ])
  const failed = [bookings, jobs, bills, customers, profiles, referralEvents, rewards, slots, workshop, claims].find(result => result.error)
  if (failed) throw failed.error
  const namesById = new Map((profiles.data || []).map(profile => [profile.id, profile.full_name]))
  const rewardedCustomerIds = new Set((referralEvents.data || []).map(event => event.referred_customer_id))
  return { bookings: bookings.data || [], jobs: (jobs.data || []).map(job => ({ ...job, referrer_name: job.profiles?.referred_by ? namesById.get(job.profiles.referred_by) || 'Dharma Motors customer' : null, referral_eligible: Boolean(job.profiles?.referred_by) && !rewardedCustomerIds.has(job.customer_id) })), bills: bills.data || [], customers: (customers.data || []).map(customer => ({ ...customer, referrer_name: customer.referred_by ? namesById.get(customer.referred_by) || 'Dharma Motors customer' : null })), rewards: rewards.data || [], slots: slots.data || [], appointmentsOpen: workshop.data?.appointments_open ?? true, claims: claims.data || [] }
}

export async function updateBookingStatus(id, status) {
  return supabase.from('bookings').update({ status }).eq('id', id)
}

export async function updateJobStatus(id, status) {
  return supabase.from('jobs').update({ status }).eq('id', id)
}

export async function createBill(bill) {
  return supabase.from('bills').insert(bill).select('id, total, status').single()
}

export async function markBillPaid(id) {
  return supabase.from('bills').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id)
}

export async function updateTimeSlot(id, enabled) {
  return supabase.from('time_slots').update(typeof enabled === 'object' ? enabled : { enabled }).eq('id', id)
}

export async function createReward(reward) {
  return supabase.from('rewards').insert(reward).select('id, name, description, points_required, enabled').single()
}

export async function createTimeSlot(slot) {
  return supabase.from('time_slots').insert(slot).select('id, label, max_bookings, enabled').single()
}

export async function createWalkinRequest(request) {
  return supabase.from('walkin_requests').insert(request).select('id').single()
}

export async function updateWorkshopStatus(appointmentsOpen) {
  return supabase.from('workshop_settings').update({ appointments_open: appointmentsOpen, updated_at: new Date().toISOString() }).eq('id', true)
}

export async function claimReward(customerId, rewardId, pointsSpent) {
  return supabase.from('reward_claims').insert({ customer_id: customerId, reward_id: rewardId, points_spent: pointsSpent }).select('id').single()
}
