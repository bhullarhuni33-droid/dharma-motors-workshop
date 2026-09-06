import React, { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight, BatteryCharging, Bell, CalendarDays, CarFront, Check, ChevronRight, CircleDollarSign,
  Clock3, Download, Gift, LayoutDashboard, LogOut, Menu, MessageCircle, MoreHorizontal,
  Plus, ReceiptText, Settings2, ShieldCheck, Sparkles, Ticket, UserRound, Users, Wrench, X, Zap
} from 'lucide-react'
import { createBatteryRequest, createBill, createBooking, createReward, createTimeSlot, createVehicle, createWalkinRequest, getAdminData, getCustomerData, getProfile, markBillPaid, normalizePhone, signInWithPhone, signUpWithPhone, supabase, updateBookingStatus, updateJobStatus, updateTimeSlot } from './lib/supabase'
import './styles.css'

const initialBookings = [
  { id: 'DM-1048', customer: 'Rahul Mehta', initials: 'RM', vehicle: 'Hyundai Creta', issue: 'Headlight flickering', date: 'Today, 10:00 AM', status: 'Confirmed', tone: 'blue' },
  { id: 'DM-1049', customer: 'Priya Shah', initials: 'PS', vehicle: 'Maruti Swift', issue: 'Battery drain overnight', date: 'Today, 11:00 AM', status: 'Pending', tone: 'orange' },
  { id: 'DM-1050', customer: 'Arjun Rao', initials: 'AR', vehicle: 'Tata Nexon', issue: 'AC not cooling', date: 'Tomorrow, 9:00 AM', status: 'Confirmed', tone: 'green' },
]
const initialJobs = [
  { id: 'JOB-2204', customer: 'Suresh Kumar', vehicle: 'Toyota Innova', issue: 'Starter motor replacement', status: 'Arrived', time: 'Since 09:42 AM' },
  { id: 'JOB-2203', customer: 'Anita Desai', vehicle: 'Honda City', issue: 'Alternator inspection', status: 'Confirmed', time: 'Today, 12:00 PM' },
  { id: 'JOB-2202', customer: 'Vikram Singh', vehicle: 'Mahindra XUV700', issue: 'Fuse and wiring repair', status: 'Completed', time: 'Yesterday' },
]
const initialBills = [
  { id: 'INV-2038', customer: 'Vikram Singh', service: 'Fuse & wiring repair', date: '02 Sep 2026', amount: 2450, status: 'Paid' },
  { id: 'INV-2037', customer: 'Neha Patel', service: 'Battery replacement', date: '01 Sep 2026', amount: 6800, status: 'Pending' },
]
const slots = ['09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM', '01:00 PM - 02:00 PM', '02:00 PM - 03:00 PM']

function Logo({ compact = false }) {
  return <div className={`brand-lockup ${compact ? 'compact' : ''}`}><span className="brand-mark"><Zap size={compact ? 16 : 20} fill="currentColor" /></span><span><strong>DHARMA</strong><small>MOTORS</small></span></div>
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [customerView, setCustomerView] = useState('overview')
  const [adminView, setAdminView] = useState('overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const [bookings, setBookings] = useState(initialBookings)
  const [jobs, setJobs] = useState(initialJobs)
  const [bills, setBills] = useState(initialBills)
  const [points, setPoints] = useState(1240)
  const [showBooking, setShowBooking] = useState(false)
  const [showVehicle, setShowVehicle] = useState(false)
  const [showBattery, setShowBattery] = useState(false)
  const [showBill, setShowBill] = useState(false)
  const [showReward, setShowReward] = useState(false)
  const [showSlot, setShowSlot] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [availableSlots, setAvailableSlots] = useState([])
  const [customerLoading, setCustomerLoading] = useState(false)
  const [adminLoading, setAdminLoading] = useState(false)

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2800) }
  const customerNav = [{ key: 'overview', label: 'Overview', icon: LayoutDashboard }, { key: 'bookings', label: 'My bookings', icon: CalendarDays }, { key: 'bills', label: 'My bills', icon: ReceiptText }, { key: 'rewards', label: 'Rewards', icon: Gift }, { key: 'refer', label: 'Refer & earn', icon: Users }]
  const adminNav = [{ key: 'overview', label: 'Dashboard', icon: LayoutDashboard }, { key: 'appointments', label: 'Appointments', icon: CalendarDays }, { key: 'jobs', label: 'Jobs', icon: Wrench }, { key: 'bills', label: 'Bills', icon: ReceiptText }, { key: 'customers', label: 'Customers', icon: Users }, { key: 'rewards', label: 'Rewards', icon: Gift }, { key: 'slots', label: 'Time slots', icon: Clock3 }]
  const mode = profile?.role === 'admin' ? 'admin' : 'customer'
  const nav = mode === 'customer' ? customerNav : adminNav
  const view = mode === 'customer' ? customerView : adminView
  const setView = mode === 'customer' ? setCustomerView : setAdminView

  React.useEffect(() => {
    if (!session || mode !== 'customer') return undefined
    setVehicles([])
    setBookings([])
    setBills([])
    setCustomerLoading(true)
    getCustomerData(session.user.id).then(data => {
      setVehicles(data.vehicles)
      setBookings(data.bookings)
      setBills(data.bills)
      setAvailableSlots(data.slots)
      setCustomerLoading(false)
    }).catch(error => { notify(error.message); setCustomerLoading(false) })
    return undefined
  }, [session, mode])

  React.useEffect(() => {
    if (!session || mode !== 'admin') return undefined
    setAdminLoading(true)
    getAdminData().then(data => {
      setBookings(data.bookings.map(booking => ({ id: booking.id, customer: booking.profiles?.full_name || 'Customer', initials: (booking.profiles?.full_name || 'CU').split(' ').map(part => part[0]).join('').slice(0, 2), vehicle: booking.vehicles?.model_name || 'Vehicle', issue: booking.problem, date: `${new Date(booking.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ${booking.time_slots?.label || ''}`, status: booking.status[0].toUpperCase() + booking.status.slice(1), tone: 'blue' })))
      setJobs(data.jobs.map(job => ({ id: job.id, customerId: job.customer_id, customer: job.profiles?.full_name || 'Customer', vehicle: job.vehicles?.model_name || 'Vehicle', issue: job.problem, status: job.status[0].toUpperCase() + job.status.slice(1), time: new Date(job.created_at).toLocaleDateString('en-IN') })))
      setBills(data.bills.map(bill => ({ id: bill.id, customer: bill.profiles?.full_name || 'Customer', service: bill.work_done, date: new Date(bill.created_at).toLocaleDateString('en-IN'), amount: Number(bill.total || 0), status: bill.status === 'paid' ? 'Paid' : 'Pending', customerId: bill.customer_id })))
      setAdminLoading(false)
    }).catch(error => { notify(error.message); setAdminLoading(false) })
    return undefined
  }, [session, mode])

  const addBooking = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = await createBooking(session.user.id, { vehicle_id: form.get('vehicleId'), slot_id: form.get('slotId'), appointment_date: form.get('date'), problem: form.get('problem') })
    if (result.error) return notify(result.error.message)
    setShowBooking(false); notify('Appointment requested successfully')
    const data = await getCustomerData(session.user.id); setBookings(data.bookings)
  }
  const addVehicle = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = await createVehicle(session.user.id, { model_name: form.get('modelName'), type: form.get('type'), fuel: form.get('fuel') })
    if (result.error) return notify(result.error.message)
    setVehicles([result.data, ...vehicles]); setShowVehicle(false); notify('Vehicle added to your garage')
  }
  const addBattery = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const result = await createBatteryRequest(session.user.id, { battery_type: form.get('batteryType'), vehicle_model: form.get('vehicleModel'), delivery_address: form.get('address'), phone: form.get('phone'), notes: form.get('notes') })
    if (result.error) return notify(result.error.message)
    setShowBattery(false); notify('Battery request sent to Dharma Motors')
  }
  const markPaid = async (id) => { const result = await markBillPaid(id); if (result.error) return notify(result.error.message); setBills(bills.map(bill => bill.id === id ? { ...bill, status: 'Paid' } : bill)); notify('Bill marked paid. Rewards will be updated by Supabase.') }
  const updateJob = async (id, status) => { const result = await updateJobStatus(id, status.toLowerCase()); if (result.error) return notify(result.error.message); setJobs(jobs.map(job => job.id === id ? { ...job, status } : job)); notify(`Job moved to ${status}`) }
  const updateAppointment = async (id, status) => { const result = await updateBookingStatus(id, status.toLowerCase()); if (result.error) return notify(result.error.message); setBookings(bookings.map(booking => booking.id === id ? { ...booking, status } : booking)); notify(`Appointment ${status.toLowerCase()}`) }
  const updateSlot = async (id, enabled) => { const result = await updateTimeSlot(id, enabled); if (result.error) return notify(result.error.message); notify(`Time slot ${enabled ? 'enabled' : 'disabled'}`) }

  React.useEffect(() => {
    if (!supabase) { setAuthLoading(false); return undefined }
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session) {
        const { data: account } = await getProfile(data.session.user.id)
        if (mounted) setProfile(account)
      }
      if (mounted) setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        const { data: account } = await getProfile(nextSession.user.id)
        if (mounted) setProfile(account)
      } else if (mounted) setProfile(null)
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  if (authLoading) return <div className="auth-loading"><Logo /><span>Loading your secure garage...</span></div>
  if (!session || !profile) return <AuthScreen onAuthenticated={(nextSession, account) => { setSession(nextSession); setProfile(account) }} />

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="sidebar-top"><Logo compact /><button className="icon-button mobile-close" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="workspace-switch"><span className="avatar avatar-blue">{mode === 'customer' ? (profile.full_name || 'C').split(' ').map(part => part[0]).join('').slice(0, 2) : 'DM'}</span><span><strong>{mode === 'customer' ? profile.full_name : 'Dharma Motors'}</strong><small>{mode === 'customer' ? 'Customer account' : 'Admin workspace'}</small></span><ChevronRight size={16} /></div>
      <nav className="main-nav">{nav.map(item => { const Icon = item.icon; return <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => { setView(item.key); setMobileNav(false) }}><Icon size={18} />{item.label}{item.key === 'appointments' && <span className="nav-count">3</span>}</button> })}</nav>
      <div className="sidebar-bottom"><button onClick={() => mode === 'customer' ? setShowBattery(true) : setAdminView('walkin')}><Plus size={17} />{mode === 'customer' ? 'Order battery' : 'Walk-in customer'}</button><button onClick={() => notify('Settings are ready for Supabase connection')}><Settings2 size={17} />Settings</button><div className="sidebar-help"><ShieldCheck size={19} /><span><strong>{mode === 'customer' ? 'Need assistance?' : 'Workshop health'}</strong><small>{mode === 'customer' ? 'Chat with our team' : 'All systems operational'}</small></span></div></div>
    </aside>
    {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}
    <main className="main-content">
      <header className="topbar"><button className="icon-button menu-button" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>{mode === 'customer' ? 'Customer portal' : 'Admin dashboard'}</span><ChevronRight size={14} /><strong>{nav.find(item => item.key === view)?.label}</strong></div><div className="topbar-actions"><button className="icon-button notification"><Bell size={18} /><i /></button><div className="user-chip"><span className="avatar avatar-dark">{(profile.full_name || 'DM').split(' ').map(part => part[0]).join('').slice(0, 2)}</span><span>{profile.full_name}</span></div><button className="icon-button" onClick={async () => { await supabase?.auth.signOut(); setSession(null); setProfile(null) }}><LogOut size={17} /></button></div></header>
      <div className="page-wrap">{mode === 'customer' ? <CustomerView view={view} profile={profile} points={profile.points ?? 0} vehicles={vehicles} bookings={bookings} bills={bills} loading={customerLoading} setView={setView} onBook={() => setShowBooking(true)} onVehicle={() => setShowVehicle(true)} onBattery={() => setShowBattery(true)} notify={notify} /> : <AdminView view={view} bookings={bookings} jobs={jobs} bills={bills} setView={setView} onBill={() => setShowBill(true)} onReward={() => setShowReward(true)} onSlot={() => setShowSlot(true)} onWalkin={() => setAdminView('walkin')} onPaid={markPaid} onJob={updateJob} onAppointment={updateAppointment} notify={notify} />}</div>
    </main>
    {showBooking && <Modal title="Book an appointment" onClose={() => setShowBooking(false)}><form onSubmit={addBooking}><Field label="Select vehicle"><select name="vehicleId" required>{vehicles.length ? vehicles.map(vehicle => <option value={vehicle.id} key={vehicle.id}>{vehicle.model_name} · {vehicle.fuel}</option>) : <option value="">Add a vehicle first</option>}</select></Field><Field label="What needs attention?"><input name="problem" placeholder="e.g. Headlights flickering" required /></Field><div className="form-grid"><Field label="Preferred date"><input name="date" type="date" min={new Date().toISOString().slice(0, 10)} required /></Field><Field label="Time slot"><select name="slotId" required><option value="">Choose a slot</option>{availableSlots.map(slot => <option value={slot.id} key={slot.id}>{slot.label}</option>)}</select></Field></div><FormActions onCancel={() => setShowBooking(false)} submit="Request appointment" /></form></Modal>}
    {showVehicle && <Modal title="Add a vehicle" onClose={() => setShowVehicle(false)}><form onSubmit={addVehicle}><Field label="Model name"><input name="modelName" placeholder="e.g. Hyundai Creta" required /></Field><div className="form-grid"><Field label="Vehicle type"><select name="type"><option value="car">Car</option><option value="suv">SUV</option><option value="truck">Truck</option></select></Field><Field label="Fuel"><select name="fuel"><option value="petrol">Petrol</option><option value="diesel">Diesel</option></select></Field></div><FormActions onCancel={() => setShowVehicle(false)} submit="Add vehicle" /></form></Modal>}
    {showBattery && <Modal title="Order a battery" onClose={() => setShowBattery(false)}><form onSubmit={addBattery}><div className="form-grid"><Field label="Battery for"><select name="batteryType"><option value="car">Car</option><option value="suv">SUV</option><option value="truck">Truck</option><option value="inverter">Inverter</option></select></Field><Field label="Phone number"><input name="phone" placeholder="10-digit mobile number" required /></Field></div><Field label="Vehicle model"><input name="vehicleModel" placeholder="e.g. Maruti Swift" required /></Field><Field label="Delivery address"><textarea name="address" placeholder="Full delivery address" required /></Field><Field label="Notes (optional)"><input name="notes" placeholder="Any preferred brand or timing?" /></Field><FormActions onCancel={() => setShowBattery(false)} submit="Send request" /></form></Modal>}
    {showBill && <Modal title="Create bill" onClose={() => setShowBill(false)}><form onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const job = jobs.find(item => item.id === form.get('jobId')); const result = await createBill({ job_id: form.get('jobId'), customer_id: job?.customerId, work_done: form.get('workDone') || 'Service completed', spare_parts: Number(form.get('parts') || 0), service_charge: Number(form.get('service') || 0), scanning_cost: Number(form.get('scanning') || 0) }); if (result.error) return notify(result.error.message); setShowBill(false); notify('Bill created and sent to customer') }}><Field label="Completed job"><select name="jobId" required>{jobs.filter(job => job.status === 'Completed').map(job => <option value={job.id} key={job.id}>{job.id} · {job.customer} · {job.vehicle}</option>)}</select></Field><Field label="Work done (optional)"><textarea name="workDone" placeholder="Describe the repair completed" /></Field><div className="form-grid"><Field label="Spare parts (optional)"><input name="parts" type="number" min="0" placeholder="0" /></Field><Field label="Service charge (optional)"><input name="service" type="number" min="0" placeholder="0" /></Field></div><Field label="Scanning cost (optional)"><input name="scanning" type="number" min="0" placeholder="0" /></Field><FormActions onCancel={() => setShowBill(false)} submit="Generate bill" /></form></Modal>}
    {showReward && <Modal title="Create reward" onClose={() => setShowReward(false)}><form onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await createReward({ name: form.get('name'), description: form.get('description'), points_required: Number(form.get('points')) }); if (result.error) return notify(result.error.message); setShowReward(false); notify('Reward created') }}><Field label="Reward name"><input name="name" placeholder="e.g. Free diagnostic scan" required /></Field><Field label="Description"><textarea name="description" placeholder="What does the customer receive?" required /></Field><Field label="Points required"><input name="points" type="number" min="1" placeholder="1000" required /></Field><FormActions onCancel={() => setShowReward(false)} submit="Create reward" /></form></Modal>}
    {showSlot && <Modal title="Add time slot" onClose={() => setShowSlot(false)}><form onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const result = await createTimeSlot({ label: form.get('label'), max_bookings: Number(form.get('capacity')) }); if (result.error) return notify(result.error.message); setShowSlot(false); notify('Time slot added') }}><Field label="Time slot"><input name="label" placeholder="03:00 PM - 04:00 PM" required /></Field><Field label="Maximum bookings"><input name="capacity" type="number" min="1" defaultValue="1" required /></Field><FormActions onCancel={() => setShowSlot(false)} submit="Add time slot" /></form></Modal>}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>
}

function AuthScreen({ onAuthenticated }) {
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const form = new FormData(event.currentTarget)
      const password = String(form.get('password') || '')
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      const result = registering
        ? await signUpWithPhone({ name: form.get('name'), phone: form.get('phone'), password, referralCode: form.get('referralCode') })
        : await signInWithPhone(form.get('phone'), password)
      if (result.error) {
        const isOwnerNumber = normalizePhone(String(form.get('phone'))) === '+917696707446'
        setError(isOwnerNumber && result.error.message.toLowerCase().includes('invalid login credentials')
          ? 'Owner account not created yet. Use Create an account once with this mobile number, then set its profile role to admin in Supabase.'
          : result.error.message.toLowerCase().includes('phone signups are disabled')
          ? 'Supabase Email auth is disabled. Enable Email provider and turn off Confirm email in Authentication > Providers.'
          : result.error.message)
      }
      else if (result.data?.session) {
        const { data: account, error: profileError } = await getProfile(result.data.session.user.id)
        if (profileError) setError('Your account has no profile yet. Run supabase/schema.sql and try again.')
        else if (account.role !== 'admin' && form.get('phone') === '7696707446') setError('This number is not enabled as an admin in Supabase.')
        else onAuthenticated(result.data.session, account)
      } else if (registering) setError('Account created. Turn off Confirm email in Supabase, then sign in with your mobile number.')
    } catch (authError) {
      setError(authError.message)
    } finally {
      setBusy(false)
    }
  }
  return <div className="auth-screen"><div className="auth-brand"><Logo /><span className="auth-tagline">Auto Electrical Specialists</span></div><div className="auth-layout"><div className="auth-intro"><span className="eyebrow light">PRECISION THAT MOVES YOU</span><h1>Electrical care,<br /><em>without the guesswork.</em></h1><p>From a flickering headlight to a fresh battery, your trusted workshop is now in your pocket.</p><div className="auth-points"><span><ShieldCheck size={17} /> Certified electrical specialists</span><span><Clock3 size={17} /> Transparent service updates</span><span><Sparkles size={17} /> Rewards on every paid bill</span></div></div><div className="auth-card"><div className="auth-card-head"><span className="auth-kicker">WELCOME TO DHARMA MOTORS</span><h2>{registering ? 'Create your account' : 'Sign in to your garage'}</h2><p>{registering ? 'Use your mobile number to get started.' : 'Customers and workshop staff use secure sign in.'}</p></div><form onSubmit={submit}>{registering && <Field label="Full name"><input name="name" placeholder="e.g. Aarav Kapoor" required /></Field>}<Field label="Mobile number"><input name="phone" inputMode="tel" placeholder="10-digit mobile number" required /></Field><Field label="Password"><input name="password" type="password" placeholder="Enter your password" required /></Field>{registering && <Field label="Referral code (optional)"><input name="referralCode" placeholder="e.g. DM-AB12CD34" /></Field>}{error && <div className="auth-error">{error}</div>}<button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? 'Checking...' : registering ? 'Create account' : 'Sign in'} {!busy && <ArrowRight size={16} />}</button></form><div className="auth-switch">{registering ? 'Already have an account?' : 'New to Dharma Motors?'} <button onClick={() => { setRegistering(!registering); setError('') }}>{registering ? 'Sign in' : 'Create an account'}</button></div></div></div><footer className="auth-footer"><Logo compact /><span>Trusted care for every connection.</span><small>© 2026 Dharma Motors</small></footer></div>
}

function CustomerView({ view, profile, points, vehicles, bookings, bills, loading, setView, onBook, onVehicle, onBattery, notify }) {
  if (view === 'bookings') return <BookingsPage bookings={bookings} onBook={onBook} />
  if (view === 'bills') return <BillsPage bills={bills} notify={notify} />
  if (view === 'rewards') return <RewardsPage points={points} notify={notify} />
  if (view === 'refer') return <ReferPage code={profile.referral_code} notify={notify} />
  const firstName = (profile.full_name || 'Customer').split(' ')[0]
  const nextBooking = bookings[0]
  return <><PageHeader eyebrow="Your workshop account" title={`Hello, ${firstName}`} subtitle="Manage your vehicles and workshop visits in one place." action="Book appointment" onAction={onBook} /><section className="hero-strip"><div><span className="eyebrow light">DHARMA MOTORS</span><h2>Electrical care made simple.</h2><p>Choose an action below to get started with your vehicle.</p><button className="button button-light" onClick={onBook}>Book a service <ArrowRight size={16} /></button></div><div className="hero-art"><CarFront size={130} strokeWidth={1} /><Zap className="hero-zap" size={30} fill="currentColor" /></div></section><section className="stat-grid customer-stats"><Stat icon={CarFront} label="My vehicles" value={vehicles.length} note="Vehicles in your garage" tone="blue" /><Stat icon={CalendarDays} label="Next booking" value={nextBooking ? new Date(nextBooking.appointment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'None'} note={nextBooking ? nextBooking.status : 'No appointment yet'} tone="gold" /><Stat icon={Sparkles} label="Reward points" value={(points || 0).toLocaleString()} note="Earn points on paid bills" tone="green" /></section><div className="content-grid"><Panel title="Quick actions"><div className="quick-grid"><QuickAction icon={CarFront} label="Add vehicle" onClick={onVehicle} /><QuickAction icon={CalendarDays} label="My bookings" onClick={() => setView('bookings')} /><QuickAction icon={ReceiptText} label="My bills" onClick={() => setView('bills')} /><QuickAction icon={BatteryCharging} label="Order battery" onClick={onBattery} /></div></Panel><Panel title="Account summary"><div className="simple-summary"><p><strong>{vehicles.length}</strong><span>vehicles saved</span></p><p><strong>{bookings.length}</strong><span>appointments</span></p><p><strong>{bills.length}</strong><span>bills available</span></p></div>{loading && <small className="loading-note">Syncing your account...</small>}</Panel></div><section className="info-band"><div className="info-icon"><MessageCircle size={22} /></div><div><strong>Need help with your vehicle?</strong><p>Chat with Dharma Motors on WhatsApp.</p></div><button className="button button-outline" onClick={() => window.open('https://wa.me/919876543210', '_blank')}>WhatsApp us <ArrowRight size={15} /></button></section></>
}

function AdminView({ view, bookings, jobs, bills, setView, onBill, onReward, onSlot, onWalkin, onPaid, onJob, onAppointment, notify }) {
  if (view === 'appointments') return <AppointmentsPage bookings={bookings} notify={notify} onWalkin={onWalkin} onAppointment={onAppointment} />
  if (view === 'jobs') return <JobsPage jobs={jobs} onJob={onJob} onBill={onBill} />
  if (view === 'bills') return <BillsPage bills={bills} notify={notify} admin onPaid={onPaid} onBill={onBill} />
  if (view === 'customers') return <CustomersPage />
  if (view === 'rewards') return <RewardsPage points={null} notify={notify} admin onReward={onReward} />
  if (view === 'slots') return <SlotsPage notify={notify} onSlot={onSlot} />
  if (view === 'walkin') return <WalkinPage notify={notify} onCreate={async request => { const result = await createWalkinRequest(request); if (result.error) return notify(result.error.message); notify('Walk-in intake saved for the workshop') }} />
  return <><PageHeader eyebrow="Tuesday, 04 September 2026" title="Good morning, Dharma Motors" subtitle="Here is what is happening at the workshop today." action="Walk-in customer" onAction={() => setView('walkin')} /><section className="stat-grid admin-stats"><Stat icon={CalendarDays} label="Appointments today" value="08" note="3 awaiting confirmation" tone="blue" /><Stat icon={Wrench} label="Active jobs" value="05" note="2 ready for pickup" tone="orange" /><Stat icon={CircleDollarSign} label="Revenue today" value="₹12,850" note="↑ 18% vs last Tuesday" tone="green" /><Stat icon={Users} label="Total customers" value="248" note="+12 this month" tone="purple" /></section><div className="content-grid admin-content"><Panel title="Today's appointments" action="View all" onAction={() => setView('appointments')}><div className="booking-list">{bookings.map(booking => <BookingRow key={booking.id} booking={booking} admin notify={notify} />)}</div></Panel><Panel title="Live workshop floor" action="Manage jobs" onAction={() => setView('jobs')}><div className="floor-summary"><div className="floor-meter"><div className="meter-ring"><strong>05</strong><small>active jobs</small></div><div className="meter-legend"><span><i className="dot blue-dot" />Confirmed <b>2</b></span><span><i className="dot orange-dot" />Arrived <b>1</b></span><span><i className="dot green-dot" />Completed <b>2</b></span></div></div><div className="service-note"><Zap size={18} /><span><strong>Workshop is flowing well</strong><small>Average service time is 2h 15m today.</small></span></div></div></Panel></div><section className="admin-lower"><Panel title="Recent payments" action="Open bills" onAction={() => setView('bills')}><BillsTable bills={bills.slice(0, 2)} compact /></Panel><Panel title="Shortcuts"><div className="shortcut-list"><button onClick={onBill}><ReceiptText size={17} /><span><strong>Create a bill</strong><small>For a completed job</small></span><ArrowRight size={16} /></button><button onClick={() => setView('slots')}><Clock3 size={17} /><span><strong>Manage time slots</strong><small>5 active slots today</small></span><ArrowRight size={16} /></button></div></Panel></section></>
}

function PageHeader({ eyebrow, title, subtitle, action, onAction }) { return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action && <button className="button button-primary" onClick={onAction}><Plus size={17} />{action}</button>}</div> }
function Stat({ icon: Icon, label, value, note, tone }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div> }
function Panel({ title, action, onAction, children }) { return <section className="panel"><div className="panel-heading"><h3>{title}</h3>{action && <button className="text-button" onClick={onAction}>{action} <ArrowRight size={14} /></button>}</div>{children}</section> }
function BookingRow({ booking, admin, notify, onAppointment }) { return <div className="booking-row"><div className={`avatar avatar-${booking.tone}`}>{booking.initials}</div><div className="row-main"><strong>{booking.customer}</strong><span>{booking.vehicle} <i /> {booking.issue}</span></div><div className="row-meta"><strong>{booking.date}</strong><span className={`status ${booking.status.toLowerCase()}`}>{booking.status}</span></div>{admin && <div className="row-actions">{booking.status === 'Pending' && <button className="small-button" onClick={() => onAppointment(booking.id, 'Confirmed')}>Confirm</button>}{booking.status === 'Confirmed' && <button className="small-button" onClick={() => onAppointment(booking.id, 'Arrived')}>Arrived</button>}{booking.status === 'Arrived' && <button className="small-button" onClick={() => onAppointment(booking.id, 'Completed')}>Complete</button>}</div>}</div> }
function QuickAction({ icon: Icon, label, onClick }) { return <button className="quick-action" onClick={onClick}><span><Icon size={19} /></span><strong>{label}</strong><ArrowRight size={15} /></button> }
function BillsTable({ bills, compact, onPaid, admin }) { return <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Service</th><th>Amount</th><th>Status</th>{admin && <th />}</tr></thead><tbody>{bills.map(bill => <tr key={bill.id}><td><strong>{bill.id}</strong><small>{bill.date}</small></td><td>{bill.customer}</td><td>{bill.service}</td><td><strong>₹{bill.amount.toLocaleString()}</strong></td><td><span className={`status ${bill.status.toLowerCase()}`}>{bill.status}</span></td>{admin && <td>{bill.status === 'Pending' && <button className="small-button" onClick={() => onPaid(bill.id)}>Mark paid</button>}</td>}</tr>)}</tbody></table></div> }
function BillsPage({ bills, notify, admin, onPaid, onBill }) { return <><PageHeader eyebrow={admin ? 'Finance desk' : 'Your documents'} title={admin ? 'Bills & payments' : 'My bills'} subtitle={admin ? 'Create invoices and keep payments moving.' : 'A clear record of every service at Dharma Motors.'} action={admin ? 'Create bill' : null} onAction={onBill} /><Panel title={admin ? 'All invoices' : 'Past services'}><BillsTable bills={bills} onPaid={onPaid} admin={admin} /><div className="table-mobile-hint">Swipe to view more details</div></Panel></> }
function BookingsPage({ bookings, onBook }) { return <><PageHeader eyebrow="Your vehicles, handled" title="My bookings" subtitle="Track every visit, from the first booking to pickup." action="Book appointment" onAction={onBook} /><Panel title="All appointments"><div className="booking-list expanded">{bookings.map(booking => <BookingRow key={booking.id} booking={booking} />)}</div></Panel></> }
function AppointmentsPage({ bookings, onWalkin, onAppointment }) { return <><PageHeader eyebrow="Front desk" title="Appointments" subtitle="Keep today's arrivals moving smoothly." action="Add walk-in" onAction={onWalkin} /><div className="filter-row"><button className="filter active">Today <span>{bookings.length}</span></button></div><Panel title="Appointments"><div className="booking-list expanded">{bookings.map(booking => <BookingRow key={booking.id} booking={booking} admin onAppointment={onAppointment} />)}{!bookings.length && <EmptyState text="No appointments yet." />}</div></Panel></> }
function JobsPage({ jobs, onJob, onBill }) { return <><PageHeader eyebrow="Workshop floor" title="Service jobs" subtitle="Move work through the shop with one clear status." action="Create bill" onAction={onBill} /><div className="job-board">{['Confirmed', 'Arrived', 'Completed'].map(status => <div className="job-column" key={status}><div className="column-heading"><span className={`status-dot ${status.toLowerCase()}`} /><h3>{status}</h3><b>{jobs.filter(job => job.status === status).length}</b></div>{jobs.filter(job => job.status === status).map(job => <div className="job-card" key={job.id}><div className="job-card-top"><strong>{job.id}</strong><button className="icon-button"><MoreHorizontal size={16} /></button></div><h4>{job.customer}</h4><p>{job.vehicle} · {job.issue}</p><small><Clock3 size={13} /> {job.time}</small><div className="job-actions">{status === 'Confirmed' && <button onClick={() => onJob(job.id, 'Arrived')}>Mark arrived</button>}{status === 'Arrived' && <button onClick={() => onJob(job.id, 'Completed')}>Complete job</button>}{status === 'Completed' && <button className="outline-action" onClick={onBill}>Create bill</button>}</div></div>)}</div>)}</div></> }
function CustomersPage() { return <><PageHeader eyebrow="Customer book" title="Customers" subtitle="248 relationships, one trusted workshop." action="Add customer" /><Panel title="Recent customers"><div className="customer-list">{['Vikram Singh', 'Neha Patel', 'Aarav Kapoor', 'Suresh Kumar'].map((name, index) => <div className="customer-row" key={name}><div className="avatar avatar-blue">{name.split(' ').map(part => part[0]).join('')}</div><span><strong>{name}</strong><small>{['Mahindra XUV700', 'Maruti Baleno', 'Hyundai Creta', 'Toyota Innova'][index]} · {index + 2} visits</small></span><span className="customer-spend">₹{[12500, 6800, 18450, 9200][index].toLocaleString()}<small>lifetime spend</small></span><ChevronRight size={17} /></div>)}</div></Panel></> }
function RewardsPage({ points, notify, admin, onReward }) { return <><PageHeader eyebrow={admin ? 'Retention engine' : 'Your loyalty wallet'} title={admin ? 'Rewards' : 'Rewards & points'} subtitle={admin ? 'Give customers another good reason to return.' : 'Every paid service brings you closer to something useful.'} action={admin ? 'Create reward' : null} onAction={onReward} />{!admin && <div className="points-card"><div><span>AVAILABLE POINTS</span><strong>{points.toLocaleString()}</strong><small>points earned from paid services</small></div><div className="points-spark"><Sparkles size={31} /></div></div>}<div className="reward-grid">{[['Free diagnostic scan', 'Full electrical health check', '1,000'], ['₹500 service voucher', 'Use on your next visit', '2,500'], ['Priority service slot', 'Skip the queue next time', '1,500']].map(([name, desc, cost], index) => <div className="reward-card" key={name}><div className="reward-icon"><Gift size={20} /></div><span className="reward-tag">{index === 0 ? 'POPULAR' : 'LOYALTY REWARD'}</span><h3>{name}</h3><p>{desc}</p><div className="reward-footer"><strong><Sparkles size={14} /> {cost} pts</strong>{!admin && <button className="small-button" onClick={() => notify(`You need ${cost} points to claim this reward`)}>Claim reward</button>}</div></div>)}</div></> }
function ReferPage({ code, notify }) { const referralCode = code || 'Loading...'; return <><PageHeader eyebrow="Bring your people" title="Refer & earn" subtitle="Share your code. You earn 200 points and your friend earns 100 points after their first ₹500+ paid service." /><section className="referral-card"><div className="referral-copy"><span className="eyebrow light">YOUR REFERRAL CODE</span><strong>{referralCode}</strong><p>Your friend enters this code while creating their account. The bonus is automatic after their first qualifying payment.</p><button className="button button-light" onClick={() => { navigator.clipboard?.writeText(referralCode); notify('Referral code copied') }}>Copy code <Ticket size={16} /></button></div><div className="referral-art"><Users size={82} /></div></section><div className="referral-steps"><div><span>01</span><strong>Share your code</strong><p>Send your personal code to a friend.</p></div><div><span>02</span><strong>They register</strong><p>They enter it during signup.</p></div><div><span>03</span><strong>You both earn</strong><p>Points arrive after a ₹500+ paid bill.</p></div></div></> }
function SlotsPage({ notify, onSlot }) { const [enabled, setEnabled] = useState([true, true, true, true, false]); return <><PageHeader eyebrow="Capacity planning" title="Time slots" subtitle="Shape the day around the work your team can do." action="Add time slot" onAction={onSlot} /><Panel title="Active booking windows"><div className="slot-list">{slots.map((slot, index) => <div className="slot-row" key={slot}><Clock3 size={17} /><strong>{slot}</strong><span>Max bookings <b>{index === 3 ? 2 : 1}</b></span><button className={`toggle ${enabled[index] ? 'on' : ''}`} onClick={() => { const next = !enabled[index]; setEnabled(enabled.map((value, itemIndex) => itemIndex === index ? next : value)); notify(`Time slot ${next ? 'enabled' : 'disabled'} locally`) }}><i /></button><button className="icon-button"><MoreHorizontal size={17} /></button></div>)}</div></Panel></> }
function EmptyState({ text }) { return <div className="empty-state">{text}</div> }
function WalkinPage({ notify, onCreate }) { return <><PageHeader eyebrow="Front desk" title="Walk-in customer" subtitle="Save the intake first, then turn it into a customer profile and job." /><div className="walkin-layout"><Panel title="Customer details"><form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); onCreate({ full_name: form.get('name'), phone: form.get('phone'), vehicle_model: form.get('model'), vehicle_type: form.get('type'), fuel: form.get('fuel'), notes: form.get('notes') }) }}><Field label="Full name"><input name="name" placeholder="Customer name" required /></Field><Field label="Mobile number"><input name="phone" inputMode="tel" placeholder="10-digit mobile number" required /></Field><div className="form-divider" /><h4>Vehicle details</h4><Field label="Model name"><input name="model" placeholder="e.g. Tata Nexon" required /></Field><div className="form-grid"><Field label="Type"><select name="type"><option value="car">Car</option><option value="suv">SUV</option><option value="truck">Truck</option></select></Field><Field label="Fuel"><select name="fuel"><option value="petrol">Petrol</option><option value="diesel">Diesel</option></select></Field></div><Field label="Notes (optional)"><textarea name="notes" placeholder="Problem reported by customer" /></Field><button className="button button-primary full-button" type="submit">Save walk-in intake <ArrowRight size={16} /></button></form></Panel><div className="walkin-note"><Zap size={20} /><h3>Fast lane for the front desk</h3><p>This saves the walk-in request in Supabase. Create the Auth profile later if the customer wants portal access.</p></div></div></> }
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label> }
function FormActions({ onCancel, submit }) { return <div className="form-actions"><button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button><button className="button button-primary" type="submit">{submit} <ArrowRight size={16} /></button></div> }
function Modal({ title, onClose, children }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={event => event.stopPropagation()}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={18} /></button></div>{children}</div></div> }

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
