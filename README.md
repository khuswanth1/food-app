# Food-app Backend API

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-psycopg3-336791.svg?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Pub%2FSub%20%26%20Cache-DC382D.svg?style=flat&logo=redis&logoColor=white)](https://redis.io/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-D71F00.svg?style=flat&logo=sqlalchemy&logoColor=white)](https://www.sqlalchemy.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

High-performance, asynchronous RESTful and WebSocket backend API for **QuickKart** — a full-featured hyper-local food and grocery delivery platform.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Architecture](#project-architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
- [Demo Credentials](#demo-credentials)
- [API Documentation](#api-documentation)
- [API Modules & Routes](#api-modules--routes)
- [Running Tests](#running-tests)
- [Docker Deployment](#docker-deployment)

---

## Features

- **Multi-Role Authentication & Authorization**: Role-based access control supporting `CUSTOMER`, `VENDOR`, `DELIVERY` (riders), and `ADMIN` with JWT tokens (access + refresh) and Google OAuth 2.0 sign-in.
- **Store & Product Discovery**: Full-text searching, category filtering, veg/non-veg toggles, and geolocation-based store availability with Redis-backed caching.
- **Cart & Order Pipeline**: Dynamic delivery fees, item validation, discount coupons, invoice generation, and full order status progression (`PLACED` &rarr; `ACCEPTED` &rarr; `PREPARING` &rarr; `READY` &rarr; `OUT_FOR_DELIVERY` &rarr; `DELIVERED`).
- **Payments**: Integrated with **Razorpay** (Orders & Verification) with seamless automatic fallback to a built-in mock gateway for local offline development.
- **Real-Time WebSockets**: Live order tracking updates and courier location coordinates broadcasted over WebSockets via Redis Pub/Sub hub.
- **Vendor Portal**: Vendor management for store menus, opening hours, product photos upload, order status updates, and revenue metrics.
- **Delivery Partner Interface**: Location pinging, order acceptance, pickup/delivery verification, and active delivery stats.
- **Admin Dashboard**: System-wide telemetry, user management, order auditing, and platform analytics.
- **Smart Recommendations & AI Suggestions**: Complementary cart items and personalized store recommendations.
- **Reverse Geocoding**: Geolocation lookup powered by OpenStreetMap Nominatim for automatic address resolution.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Framework** | [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) (Asynchronous ASGI) |
| **ORM & Database** | [SQLAlchemy 2.0](https://www.sqlalchemy.org/) + [psycopg3](https://www.psycopg.org/) (PostgreSQL) / SQLite fallback |
| **Caching & Messaging** | [Redis](https://redis.io/) (Query cache & WebSocket multi-worker Pub/Sub) |
| **Data Validation** | [Pydantic v2](https://docs.pydantic.dev/) & `pydantic-settings` |
| **Security** | [PyJWT](https://pyjwt.readthedocs.io/), [Passlib / Bcrypt](https://github.com/pyca/bcrypt/) |
| **Payments** | [Razorpay Python SDK](https://razorpay.com/) / Mock Payment Gateway |
| **Testing** | [Pytest](https://docs.pytest.org/), [HTTPX](https://www.python-httpx.org/) |
| **Containerization** | Docker (Multi-worker production configuration) |

---

## Project Architecture

```
backend/
├── app/
│   ├── core/               # App configuration, DB sessions, security, logging, cache
│   │   ├── config.py       # Pydantic environment settings
│   │   ├── database.py     # SQLAlchemy engine & session factory
│   │   ├── security.py     # Password hashing & JWT token generators
│   │   ├── cache.py        # Redis / in-memory cache abstractions
│   │   └── logging.py      # Request ID middleware & structured logging
│   ├── models/             # SQLAlchemy ORM models
│   │   ├── user.py         # User & Address models
│   │   ├── store.py        # Store, Product, Category models
│   │   ├── order.py        # Order, OrderItem, StatusEvent models
│   │   ├── commerce.py     # Coupon, Cart, Review models
│   │   └── support.py      # Support tickets & notifications
│   ├── schemas/            # Pydantic request / response schemas
│   ├── routers/            # FastAPI API route controllers (/api/v1)
│   │   ├── auth.py         # Login, registration, Google OAuth, refresh tokens
│   │   ├── stores.py       # Restaurant/grocery catalog & search
│   │   ├── cart.py         # Persistent shopping cart endpoints
│   │   ├── orders.py       # Order checkout, history, cancellation
│   │   ├── payments.py     # Razorpay order creation & webhook verification
│   │   ├── vendor.py       # Vendor product management & store operations
│   │   ├── delivery.py     # Rider tracking & delivery fulfillment
│   │   ├── admin.py        # Platform oversight & metrics
│   │   └── ws.py           # Real-time WebSocket connection router
│   ├── services/           # Business logic & 3rd-party integrations
│   │   ├── razorpay.py     # Razorpay payment verification
│   │   ├── realtime.py     # WebSocket pub/sub connection hub
│   │   ├── geocode.py      # Nominatim reverse geocoding
│   │   ├── recommendations.py # Recommendation algorithms
│   │   └── uploads.py      # Product image validation & filesystem storage
│   ├── bootstrap.py        # Table schema bootstrap runner
│   ├── seed.py             # Deterministic mock data generator
│   └── main.py             # ASGI application initialization & middleware setup
├── tests/                  # Pytest test suite
├── uploads/                # Static uploaded product media files
├── .env.example            # Environment variable template
├── .gitignore              # Repository gitignore configuration
├── Dockerfile              # Container deployment file
├── requirements.txt        # Python dependency manifest
└── pytest.ini              # Pytest configuration
```

---

## Getting Started

### Prerequisites

- **Python 3.11+** installed
- **PostgreSQL** (optional; defaults to SQLite if `DATABASE_URL` is omitted)
- **Redis** (optional; defaults to in-memory cache & local hub when omitted)

### Installation

1. **Clone the repository and enter the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment**:
   - **Windows (PowerShell)**:
     ```powershell
     python -m venv .venv
     .venv\Scripts\Activate.ps1
     ```
   - **Linux / macOS**:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

### Environment Variables

Copy `.env.example` to `.env` and adjust the variables as required:

```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
|---|---|---|
| `ENV` | Environment mode (`development` / `production`) | `development` |
| `DATABASE_URL` | SQLAlchemy connection string | `postgresql+psycopg://postgres:password@localhost:5432/quickkart` (or `sqlite:///./quickkart.db`) |
| `REDIS_URL` | Redis server connection URI | `redis://localhost:6379/0` (or leave empty for in-memory) |
| `JWT_SECRET` | Secret key for signing access & refresh tokens | Minimum 32-character secure random string |
| `SEED_ON_STARTUP` | Automatically populate database with mock data on first run | `true` |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID (Leave empty to use Mock Gateway) | `rzp_test_...` |
| `RAZORPAY_KEY_SECRET`| Razorpay API Secret | `...` |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth 2.0 Web Client ID | `...apps.googleusercontent.com` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth Client Secret | `...` |
| `FRONTEND_URL` | Web client origin for CORS and OAuth redirects | `http://localhost:5173` |

### Running Locally

Start the development server with live reload:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The server will automatically bootstrap database tables and seed demo data if the database is empty and `SEED_ON_STARTUP=true`.

You can also seed manually at any time:
```bash
python -m app.seed
```

---

## Demo Credentials

The database comes pre-populated with deterministic demo users across all roles:

| Role | Email | Password | Access / Capabilities |
|---|---|---|---|
| **Admin** | `admin@quickkart.dev` | `Password@123` | Platform analytics, all stores, users, & audit logs |
| **Vendor** | `vendor@quickkart.dev` | `Password@123` | Menu item updates, order acceptance, store metrics |
| **Delivery Rider** | `rider@quickkart.dev` | `Password@123` | GPS location broadcast, order delivery workflow |
| **Customer** | `customer@quickkart.dev` | `Password@123` | Cart, checkout, order tracking, reviews |

*(Additional customer accounts: `aman@quickkart.dev`, `neha@quickkart.dev`, `rohan@quickkart.dev` with the same password)*.

---

## API Documentation

Once the backend is running, explore the interactive documentation:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

---

## API Modules & Routes

All REST endpoints are prefixed with `/api/v1`:

| Router | Prefix | Key Endpoints |
|---|---|---|
| **Auth** | `/auth` | `POST /login`, `POST /register`, `POST /refresh`, `GET /google/login`, `GET /google/callback` |
| **Users** | `/users` | `GET /me`, `PUT /me`, `GET /addresses`, `POST /addresses` |
| **Stores** | `/stores` | `GET /`, `GET /{id}`, `GET /{id}/products`, `GET /categories` |
| **Cart** | `/cart` | `GET /`, `POST /items`, `PUT /items/{id}`, `DELETE /items/{id}` |
| **Orders** | `/orders` | `POST /checkout`, `GET /`, `GET /{id}`, `POST /{id}/cancel` |
| **Payments**| `/payments` | `POST /create-order`, `POST /verify`, `POST /webhook` |
| **Vendor** | `/vendor` | `GET /orders`, `POST /products`, `POST /products/{id}/photo`, `PUT /store/status` |
| **Delivery**| `/delivery` | `POST /location`, `GET /assigned`, `POST /orders/{id}/accept`, `POST /orders/{id}/delivered` |
| **Admin** | `/admin` | `GET /metrics`, `GET /stores`, `GET /orders`, `PUT /users/{id}/role` |
| **Engagement** | `/engagement` | `GET /recommendations`, `GET /coupons`, `POST /reviews` |
| **WebSocket** | `/ws` | `WS /ws/orders/{order_id}`, `WS /ws/rider/{rider_id}` |

---

## Running Tests

The test suite validates authentication, business rules, cart pricing, discovery, geocoding, and order flows:

```bash
# Run all tests
pytest

# Run tests with verbose output
pytest -v

# Run a specific test suite
pytest tests/test_orders.py
```

---

## Docker Deployment

Build and run using Docker:

1. **Build the container image**:
   ```bash
   docker build -t quickkart-backend .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     -p 8000:8000 \
     --env-file .env \
     --name quickkart-api \
     quickkart-backend
   ```

3. **Check container status & health**:
   ```bash
   docker ps
   curl http://localhost:8000/health
   ```
