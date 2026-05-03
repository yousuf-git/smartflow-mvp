# SmartFlow MVP — Tech Stack & Architectural Justifications

This document serves as the single source of truth for the technologies, frameworks, and libraries powering the SmartFlow MVP. Unlike a simple version list, this guide provides the **architectural rationale** for each choice, evaluates the **alternatives considered**, and explains how these decisions align with the project's unique requirements (real-time water dispensing, secure wallet transactions, and IoT reliability).

---

## 1. System Overview

SmartFlow is a distributed system consisting of three main tiers:
1.  **Firmware (IoT)**: ESP32-based controllers managing physical valves and flow sensors.
2.  **Backend (Server)**: A FastAPI-based orchestrator handling business logic, financial ledgering, and IoT pub/sub.
3.  **Frontend (Web)**: A modern React application providing a seamless "Wallet" experience for customers and administrative dashboards for managers.

---

## 2. Backend Architecture (`smartflow.server/`)

### Core Framework: FastAPI (Python 3.13)
*   **Why?**: FastAPI was chosen for its first-class support for `async/await`. In an IoT-centric system, the server must handle hundreds of concurrent WebSocket and MQTT streams without blocking.
*   **Alternatives Considered**:
    *   **Django**: Rejected as "too heavy" for this micro-service style architecture. Django's synchronous heritage makes it less natural for high-concurrency IoT coordination.
    *   **Flask**: Rejected due to the lack of built-in schema validation (Pydantic) and the manual effort required to make it fully async-performant.
*   **Why Not Django/Flask?**: For SmartFlow, the "Push" of data from IoT devices must be fanned out to Web clients in real-time. Django's thread-per-request model would struggle with the long-lived connections required for this.

### Database: PostgreSQL
*   **Why?**: The project involves a **Wallet & Ledger system** where ACID compliance is non-negotiable. PostgreSQL offers superior reliability, advanced data types (native UUIDs), and robust async drivers.
*   **Alternatives Considered**:
    *   **MongoDB (NoSQL)**: **Why Not?** While MongoDB scales horizontally well, it lacks the strict relational integrity needed for a financial ledger. Balancing a user's wallet across multiple "canes" in a single order requires the transactional "All-or-Nothing" guarantee that only a relational DB provides.
    *   **MySQL**: **Why Not?** While MySQL is a valid RDBMS, PostgreSQL's `asyncpg` driver is significantly faster for high-concurrency writes, and its support for JSONB and complex Check Constraints (e.g., limiting canes per tap) is more flexible.

### ORM: SQLAlchemy (Async)
*   **Why?**: Provides a powerful, type-safe Declarative mapping.
*   **Alternatives Considered**:
    *   **Tortoise ORM / Prisma**: **Why Not?** While these are modern and "cleaner," SQLAlchemy 2.0 has the most mature connection pooling and community support. In a mission-critical system like water dispensing, we chose the "Industry Standard" for reliability.

### Validation & Serialization: Pydantic
*   **Why Not Marshmallow?**: Pydantic is 5-10x faster and uses standard Python type hints. This ensures that the data coming from the IoT devices matches exactly what the Frontend expects, preventing "Schema Drift."

---

## 3. Frontend Architecture (`smartflow.web/`)

### UI Library: React 19
*   **Why?**: React's component model was essential for building the "Cane Builder" and "Progress Screen" UI.
*   **Alternatives Considered**:
    *   **Vue.js / Angular**: **Why Not?** While Vue is easier to learn, React's ecosystem for specialized libraries (GSAP, MUI) is unparalleled. Angular was rejected as being "too opinionated" and heavy for a mobile-first "Wallet" web app.
    *   **Next.js**: **Why Not?** Next.js is excellent for SEO-driven sites, but the SmartFlow Wallet is a **functional application** behind an auth wall. A pure SPA (Vite + React) is lighter, easier to host on static services (S3/Netlify), and avoids the complexity of Server-Side Rendering (SSR) which isn't needed here.

### State Management: React Context + Hooks
*   **Why Not Redux?**: Redux introduces significant boilerplate. For the MVP, React's native `Context API` and `useReducer` are sufficient to manage the Auth state and the current Order progress without the overhead of a global store.

### Styling: MUI + Tailwind CSS
*   **Why Not Shadcn/UI?**: Shadcn requires copying code into the project and manual maintenance. MUI (Material UI) provides a production-ready, standardized component library out of the box, allowing us to focus on business logic rather than building buttons and sliders from scratch.
*   **Why Not Plain CSS?**: Tailwind allows for "Utility-First" design, which is significantly faster for making the app responsive across different mobile screen sizes (the primary device for SmartFlow).

### Real-time Communication: Native WebSockets
*   **Why Not Socket.io?**: Socket.io requires a custom server-side library and adds client-side bloat. Native WebSockets are supported by all modern browsers and FastAPI, providing the lowest possible latency for flow progress updates.

---

## 4. IoT & Firmware (`smartflow.iot/`)

### Hardware: ESP32 (DevKitV1)
*   **Why Not Arduino Uno/Nano?**: Standard Arduinos lack Wi-Fi and the processing power to handle modern SSL/TLS encryption.
*   **Why Not Raspberry Pi?**: A Pi is a full computer; it's overkill and "fragile" for an industrial environment. The ESP32 is a microcontroller that boots in milliseconds and is highly power-efficient.

### Framework: Arduino (C++)
*   **Why Not ESP-IDF?**: ESP-IDF is the professional "native" SDK. However, for the MVP, the **Arduino Framework** allowed us to integrate third-party libraries (PubSubClient, ArduinoJson) in days rather than weeks. The trade-off in binary size was worth the 3x increase in development speed.

### Connectivity: AWS IoT Core (MQTT over TLS)
*   **Why?**: Provides enterprise-grade security via **mTLS (Mutual TLS)**. Every ESP32 has its own unique certificate.
*   **Alternatives Considered**:
    *   **Self-Managed Mosquitto**: **Why Not?** Managing a secure MQTT broker (handling certs, scaling, high availability) is a full-time job. AWS IoT Core is a "Serverless" broker that handles all the security and scaling overhead for pennies per month.
    *   **HTTP/REST for IoT**: **Why Not?** HTTP is "Request-Response." MQTT is "Pub/Sub." For a flow meter that needs to send updates every second, the overhead of HTTP headers would consume too much bandwidth and power.

---

## 5. Summary Matrix: The "Why Not" List

| Category | Technology | The "Why Not" (The Main Rival Rejected) |
| :--- | :--- | :--- |
| **Backend** | **FastAPI** | Rejected **Node.js** (Type-safety/IoT ecosystem) & **Django** (Sync-first). |
| **Database** | **PostgreSQL** | Rejected **MongoDB** (No ACID/Transactional safety for wallet). |
| **Frontend** | **React** | Rejected **Next.js** (SSR overhead not needed for an App). |
| **Build Tool** | **Vite** | Rejected **Webpack** (Slow dev startup/HMR). |
| **UI Library** | **MUI** | Rejected **Shadcn** (Maintenance burden of "copied" components). |
| **Hardware** | **ESP32** | Rejected **ESP8266** (Not enough RAM for AWS IoT TLS). |
| **IoT Broker** | **AWS IoT** | Rejected **Custom Mosquitto** (Security/Ops overhead). |

---

## 6. Changelog

*   **2026-05-03**: Expanded "Why Not" analysis for all tiers. Added granular comparisons for State Management, Styling, and IoT connectivity.
*   **2026-04-24**: Added SQLAlchemy (Async) and PostgreSQL to the stack for V1.1 wallet features.
*   **2026-04-23**: Initial stack definition (FastAPI, React, MQTT).
03**: Expanded "Why Not" analysis for all tiers. Added granular comparisons for State Management, Styling, and IoT connectivity.
*   **2026-04-24**: Added SQLAlchemy (Async) and PostgreSQL to the stack for V1.1 wallet features.
*   **2026-04-23**: Initial stack definition (FastAPI, React, MQTT).
