# Opacly — Smart Parking App

A full two-app parking prototype built with React + Vite.

## Apps included

### 🚗 Driver App
A mobile-first UI (rendered in a phone frame) with:
- Mobile number + OTP login
- Home dashboard with live slot availability
- Search parking by location
- Interactive map view
- Parking details (price, rating, hours, available slots)
- Booking flow with auto-assigned slot
- Payment (UPI / Card / Wallet / **Cash on Parking**)
- Booking confirmation with entry OTP
- My Bookings
- Profile

### 🔒 Owner Console (hidden)
A secret single-screen panel for parking attendants:
- Live slot counts (Available / Filled / Locked)
- Enter customer OTP + manually type vehicle number plate
- Verify OTP to allow vehicle entry
- Live sync with Driver App — slot counts update in real time

**To open the Owner Console:** tap the **Opacly logo** in the header **5 times quickly**.

## Tech stack
- React 18
- Vite 5
- lucide-react (icons)
- Pure inline styles (no CSS framework)
- Shared in-memory real-time state (React Context)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start dev server (opens at http://localhost:3000)
npm run dev

# 3. Build for production
npm run build

# 4. Preview production build
npm run preview
```

## Project structure

```
opacly/
├── index.html              # Vite HTML entry point
├── vite.config.js          # Vite config (React plugin, port 3000)
├── package.json
├── public/
│   └── favicon.svg         # Opacly pin logo favicon
└── src/
    ├── main.jsx            # React DOM root mount
    ├── index.css           # Global resets + animations
    └── App.jsx             # Complete app (store + all screens)
```

## Key concepts

- **StoreProvider** — single React context holding all slot state. Both Driver App and Owner Console read from and write to the same store, so actions in one instantly reflect in the other.
- **Auto slot assignment** — when a driver books, the nearest free slot is picked randomly. No manual slot picker shown to users.
- **Cash on Parking** — similar to COD; driver selects this option and pays at the gate. Slot is still held with an OTP.
- **Lock expiry** — slots locked for payment auto-release after 5 minutes if unpaid (timer runs every second).

---

Built for Opacly by Subrat Kumar · Founder, OPACLY
