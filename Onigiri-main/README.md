# MindForge

MindForge is a premium, minimalist desktop application designed to help students track their focus, manage distractions, and build better study habits. Featuring a calm, Notion/Linear-inspired interface, it uses a **Session-Based Architecture** to monitor your active applications and browser tabs, computing a real-time **Focus Score** to visualize your productivity.

## Core Features

- **Real-Time Focus Score**: A score from 0-100 that updates every 10 seconds based on your active window.
- **Pomodoro Timer & Smart Breaks**: Built-in Pomodoro timer to structure work sessions effectively.
- **Ambient Sound Player**: Integrated lofi and ambient sounds to enhance concentration.
- **App Blocker / Distraction Shield**: Strict monitoring and blocking of digital distractions.
- **Weekly & Monthly Analytics Dashboard**: Detailed insights and heatmaps tracking your focus trends over time.
- **Daily Focus Summary**: Get a comprehensive summary of your daily achievements.
- **Deep Work Ramp**: Tracks your daily deep work minutes against your goals.
- **Habit Tracker**: Logs daily habits (reading, meditation, focus sessions) and calculates your current streak.
- **Focus Rooms & Leaderboard**: Multiplayer virtual rooms to study alongside others, featuring real-time online presence, typing indicators, emojis, and a leaderboard.
- **In-Memory Session Tracking**: Total privacy and zero lag. Tracking only happens when you start a session, keeping data locally in RAM until the session ends.
- **Focus Interventions**: Detects "focus spirals" (rapid drops in score) and suggests interventions.
- **Deep Work Ramp**: Tracks your daily deep work minutes against your goals.
- **Habit Tracker**: Logs daily habits like reading, meditation, and focus sessions, calculating your current streak.
- **Focus Rooms**: Multiplayer virtual rooms where you can study alongside others and react with emojis.
- **Chrome Extension integration**: Syncs browser tab categories to strictly monitor digital distractions.

## Tech Stack
- **Desktop Engine**: Electron + Node.js
- **Frontend UI**: React + Vite + Tailwind CSS + Recharts
- **Authentication**: Clerk
- **Database**: Supabase
- **System Monitoring**: Custom PowerShell active window watcher (`child_process.execFileSync`)
- **Real-Time Data**: Express.js + WebSockets
- **Browser Integration**: Custom Chrome Extension for tracking tab categories
- **AI Integration**: Groq API (Llama-3.1-8b-instant) for smart focus interventions

---

## Project Structure

```text
mindforge/
├── main.js                  # Electron main process (Window management)
├── preload.js               # IPC bridge (Secure renderer <-> main communication)
├── seed.js                  # Script to seed Supabase with demo data
├── supabase_schema.sql      # Supabase database schema for tracking scores and habits
├── .env                     # App credentials (Supabase, Groq, App Server)
│
├── core/                    # Backend Node.js logic (Runs in Electron Main)
│   ├── db.js                # Supabase client and query functions
│   ├── session.js           # In-memory session manager (holds active events)
│   ├── watcher.js           # Polls active Windows app using PowerShell every 2s
│   ├── scorer.js            # Calculates the Focus Score every 10s using session data
│   └── server.js            # Express & WebSocket server for the UI
│
├── renderer/                # React Frontend (Runs in Electron Renderer)
│   ├── index.html           # Vite entry HTML
│   ├── package.json         # UI dependencies (Clerk, Recharts, Tailwind)
│   └── src/
│       ├── main.jsx         # React root
│       ├── App.jsx          # App layout, Sidebar, Routing, and Authentication
│       ├── index.css        # Global CSS, Minimalist dark theme inspired by Linear
│       └── components/
│           ├── LiveScore.jsx         # Live session controls & animated focus score
│           ├── PomodoroTimer.jsx     # Smart Pomodoro timer
│           ├── Analytics.jsx         # Comprehensive analytics dashboard
│           ├── DistractionShield.jsx # Focus protection and app blocking
│           ├── AmbientPlayer.jsx     # Background sounds for deep work
│           ├── DailySummary.jsx      # End-of-day focus performance review
│           ├── Heatmap.jsx           # 7x24 focus heatmap visualization
│           ├── DeepWorkRamp.jsx      # Weekly bar chart and daily sprint progress
│           ├── FocusDebt.jsx         # Tracks accumulated un-returned focus time
│           ├── DailyHabits.jsx       # Cards + Streak counter + Contribution grid
│           └── FocusRoom.jsx         # Virtual multiplayer room and live status
│
└── extension/               # Chrome Extension (Distraction blocker)
    ├── manifest.json        # MV3 manifest
    ├── background.js        # Tracks tabs and POSTs events to desktop server
    └── content.js           # Injects friction overlays on distraction websites
```

---

## Setup & Installation

### 1. Database Setup
1. Create a free project on [Supabase.com](https://supabase.com/).
2. Open the **SQL Editor** in your Supabase dashboard.
3. Paste the contents of `supabase_schema.sql` into the editor and hit **Run** to generate the required tables.

### 2. Environment Variables
In the root directory of the `mindforge` project, replace the placeholder values in `.env` with your credentials:
```env
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_actual_key
VITE_ROOM_SERVER=https://your-room-server.com
GROQ_API_KEY=your_groq_api_key
```

### 3. Install Dependencies
```bash
# Install root (Electron/Backend) dependencies
npm install

# Install UI (Vite/React) dependencies
cd renderer
npm install
cd ..
```

### 4. (Optional) Seed Demo Data
Populate your database with 7 days of realistic habit, session, and focus score data to see the UI in action immediately.
```bash
npm run seed
```

### 5. Start the App
Run the Vite development server and launch the Electron app concurrently.
```bash
cd ../mindforge
npm install
cd renderer && npm install && cd ..
npm start
```

### 6. Chrome Extension
If you want to track browser tabs efficiently:
1. Open Google Chrome.
2. Go to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `/extension` directory.

---

## How It Works (Session Architecture)
1. **Idle State**: The app boots entirely idle. The local watcher relies heavily on intent rather than continuous background surveillance.
2. **Focus Session**: In the **Dashboard**, clicking "Start Session" activates tracking. Your "goal" is saved, and `core/watcher.js` begins querying your OS for the active application using a native Win32 API.
3. **In-Memory Tracking**: Event changes are stored in RAM within `core/session.js`. We purposefully don't write to Supabase continuously to ensure entirely zero-latency performance.
4. **Scoring Engine**: Every 10 seconds, `core/scorer.js` reads the last 60 seconds of memory, classifies application types (Productive vs. Distraction), and broadcasts a computed score to the UI over WebSockets (`ws://localhost:39871`).
5. **Dual-Stream Data Pipeline**: While the desktop watcher logs OS-level app usage (e.g., "Chrome is active"), the **Chrome Extension** acts as a secondary data stream. It monitors active tabs, classifies URLs, and POSTs per-site analytics (time spent on specific hostnames, content types like video/text) into the session memory.
6. **Session End**: Upon ending the session, Node computes the session's overall metrics. The OS OS-level breakdown, Focus Score, Deep Work minutes, AND the Extension's granular per-site analytics are all flushed to Supabase simultaneously, populating the `sessions` and `session_sites` tables for detailed historical analytics.
