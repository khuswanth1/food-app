# ⚡ Food-App Frontend

A modern, high-performance single-page web application (SPA) built for the **QuickKart** hyper-local food and grocery delivery ecosystem. Powered by **React 18**, **Vite 5**, and **Tailwind CSS**.

---

## 🚀 Features by Role

### 🛍️ Customer Experience
- **Store Discovery & Browsing**: Explore hyper-local restaurants and grocery stores with category filtering, ratings, and delivery estimates.
- **Smart Cart & Checkout**:
  - Store-scoped cart with intelligent conflict detection (`CartConflictModal`).
  - Dynamic minimum order amount alerts and free delivery thresholds.
- **Real-Time Live Order Tracking**:
  - Interactive map powered by **Leaflet** / **React-Leaflet** displaying store, customer, and delivery rider locations.
  - Multi-stage order status timeline (Placed → Confirmed → Preparing → Out for Delivery → Delivered).
- **Secure Online Payments**: Integrated **Razorpay** checkout modal supporting cards, UPI, and net banking.
- **User Profile & Address Book**: Save multiple delivery addresses with GPS geolocation picker.
- **Favorites & Reviews**: Bookmark favorite stores and leave detailed ratings and reviews.

### 🏪 Vendor Portal (`/vendor`)
- **Dashboard & Analytics**: Daily sales, order volume, and revenue metrics.
- **Store Management**: Manage store profile, operating hours, and banner visuals.
- **Product & Inventory Catalog**: Add, update, and toggle item availability in real-time.
- **Order Management**: Accept, prepare, and dispatch orders with instant status updates.

### 🛵 Delivery Partner Portal (`/delivery`)
- **Delivery Queue**: View assigned orders ready for pickup.
- **Turn-by-Turn Route Guidance**: Real-time GPS coordinates for pickup and delivery destinations.
- **Order Status Transitions**: Mark orders as *Picked Up*, *On the Way*, and *Delivered*.

### 🛡️ Admin Control Center (`/admin`)
- **Executive Analytics**: Revenue graphs, order distributions, and user growth powered by **Recharts**.
- **User & Vendor Management**: Approve or disable customer, vendor, and delivery partner accounts.
- **Store & Product Catalog Control**: Oversee all multi-vendor listings.
- **Discount & Promotions**: Manage promo codes, discounts, and expiration rules.
- **Payment & Audit Tracking**: View payment logs, transaction statuses, and administrative audit trails.
- **Customer Support Tickets**: Review and resolve customer queries.

---

## 🛠️ Technology Stack

| Category | Technology |
| :--- | :--- |
| **Core Framework** | [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/) |
| **Routing** | [React Router v6](https://reactrouter.com/) (Lazy loaded routes with Suspense) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) + Emotion CSS |
| **Icons & UI** | [Material UI Icons](https://mui.com/material-ui/material-icons/) |
| **Maps & Geolocation** | [Leaflet](https://leafletjs.com/) + [React-Leaflet](https://react-leaflet.js.org/) |
| **Data Visualization** | [Recharts](https://recharts.org/) |
| **Networking & Real-time** | [Axios](https://axios-http.com/) + Native WebSockets (`useSocket` hook) |
| **Testing** | [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/) |
| **Containerization** | Multi-stage Docker + Nginx reverse proxy |

---

## 📁 Directory Structure

```text
frontend/
├── public/                 # Static assets & favicon
├── src/
│   ├── api/                # Axios client & WebSocket setup
│   │   └── client.js
│   ├── components/         # Reusable presentation & layout components
│   │   ├── AddressForm.jsx
│   │   ├── CartConflictModal.jsx
│   │   ├── Charts.jsx
│   │   ├── DataTable.jsx
│   │   ├── Layout.jsx      # CustomerLayout & DashboardLayout
│   │   ├── LocationPicker.jsx
│   │   ├── MinOrderBar.jsx
│   │   ├── OrderTimeline.jsx
│   │   ├── PaymentModal.jsx
│   │   ├── ProductCard.jsx
│   │   ├── RequireRole.jsx # Route-level RBAC guard
│   │   ├── TrackingMap.jsx # Interactive Leaflet map
│   │   └── ui.jsx
│   ├── context/            # React Contexts (Auth, Cart, Notification, Theme, Toast)
│   ├── hooks/              # Custom hooks (useApi, useLocation, useSocket)
│   ├── pages/              # Role-specific and public view pages
│   │   ├── admin/          # Admin dashboards and management views
│   │   ├── delivery/       # Delivery driver portal
│   │   ├── vendor/         # Vendor store and catalog management
│   │   ├── Cart.jsx
│   │   ├── Home.jsx
│   │   ├── OrderDetail.jsx
│   │   └── ...
│   ├── test/               # Unit and component test suites
│   ├── utils/              # Currency/date formatters, payment helpers
│   ├── App.jsx             # Main routing table with code-splitting
│   ├── index.css           # Tailwind directives and custom scrollbars
│   └── main.jsx            # Application root render
├── .dockerignore
├── .env.example            # Environment variables blueprint
├── .gitignore              # Git ignore rules for Vite, Node & build outputs
├── Dockerfile              # Multi-stage production build container
├── nginx.conf              # Production Nginx reverse-proxy config
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## ⚙️ Getting Started

### Prerequisites
- **Node.js** (v18 or v20+ recommended)
- **npm** (v9+)
- Running instance of the **QuickKart Backend API** (FastAPI)

### 1. Installation

Clone the repository and install dependencies:

```bash
cd frontend
npm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` to match your backend endpoints:

```env
# Backend API base URL
VITE_API_URL=http://localhost:8000/api/v1

# WebSocket endpoint for real-time order tracking
VITE_WS_URL=ws://localhost:8000
```

### 3. Development Server

Start the Vite development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

The app will be available at: **`http://localhost:5173`**

---

## 🧪 Testing

Run unit and integration tests using Vitest:

```bash
# Run tests once
npm run test

# Run tests in watch mode
npm run test:watch
```

---

## 📦 Production Build & Deployment

### Build Distributable Bundle

```bash
npm run build
```

The compiled assets will be output to the `dist/` folder.

Preview the production build locally:

```bash
npm run preview
```

### Docker Container Deployment

The frontend includes a production-ready, multi-stage `Dockerfile` with Nginx:

```bash
# Build Docker image
docker build -t quickkart-frontend .

# Run container on port 80
docker run -d -p 80:80 --name quickkart-ui quickkart-frontend
```

The embedded `nginx.conf` handles:
- Client-side Single Page Application (SPA) routing fallback (`try_files $uri /index.html`)
- Reverse proxying `/api/` and `/ws/` requests to the backend service
- Gzip compression and static asset caching

---

## 🌿 Git Branch Strategy

In this repository:
- **`main`**: Tracks the frontend application.
- **`master`**: Tracks the backend service.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
