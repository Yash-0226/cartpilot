# 🛒 CartPilot

### AI-Native Commerce Agent with a Safety-Controlled Transaction Pipeline

CartPilot is an AI-powered commerce agent that makes traditional merchant catalogs **transactible by AI buyers** while ensuring that monetary actions remain **explainable, bounded, gated, auditable, and safely handled**.

Instead of allowing an AI agent to directly control money, CartPilot separates product decision-making from transaction authorization.

> **AI decides. Deterministic guardrails control the money.**

---

## 🚀 Problem

As AI agents evolve from chat assistants into autonomous buyers, they need to interact with merchants and eventually initiate purchases.

However, giving an AI unrestricted access to transactions creates important risks:

- What if the AI selects the wrong product?
- What if the price changes?
- What if the product is out of stock?
- What if the purchase exceeds the user's budget?
- What if the AI attempts to manipulate the transaction?
- How can the user understand and verify what happened?

CartPilot addresses these problems by placing a deterministic safety layer between the AI decision and the payment system.

---

## 💡 Solution

CartPilot creates a controlled agentic-commerce pipeline:

```text
👤 User / AI Buyer
        ↓
🏪 Merchant Product Catalog
        ↓
🤖 AI Agent
        ↓
🛡️ Deterministic Guardrails
        ↓
👤 Explicit User Approval
        ↓
💳 Razorpay Test Payment
        ↓
✅ Server-Side Verification
        ↓
📜 Audit Trail
```

The AI can recommend a product, but it cannot directly execute a monetary transaction.

---

## ✨ Key Features

### 🤖 Natural-Language Product Selection

Users can describe what they need in natural language.

Example:

> "I need something to protect my backpack from rain."

CartPilot's AI agent interprets the request and selects the most suitable product from the merchant catalog.

---

### 🛡️ Deterministic Guardrails

Every proposed transaction is independently checked by the backend.

CartPilot verifies:

- Product exists in the merchant catalog
- Product is in stock
- AI-provided price matches the merchant price
- Purchase is within the user's budget

The guardrails are deterministic and are not controlled by the AI.

---

### 💰 Budget Protection

Users define how much they are willing to spend.

For example:

```text
User Budget:       ₹100
Product Price:     ₹199

Result: ❌ BLOCKED
Reason: Purchase exceeds budget
```

No payment order is created when the transaction fails the guardrail.

---

### 🔐 Price Integrity Protection

CartPilot verifies that the price proposed by the AI matches the merchant catalog.

For example:

```text
Merchant Price:    ₹199
Attempted Price:   ₹200

Result: ❌ BLOCKED
Reason: Price mismatch detected
```

This protects the transaction from incorrect or manipulated pricing information.

---

### 👤 Explicit User Approval

Even after all safety checks pass, CartPilot requires explicit user approval before creating a payment order.

```text
AI Decision
     ↓
Guardrails Passed
     ↓
User Approval Required
     ↓
Payment
```

This creates a separate boundary between **AI recommendation** and **financial authorization**.

---

### 💳 Razorpay Test Mode

CartPilot integrates Razorpay Test Mode to demonstrate the payment stage of the agentic-commerce flow.

The backend creates the Razorpay order only after:

1. AI decision
2. Guardrail validation
3. User approval

Payment signatures are verified server-side before the transaction is considered successful.

---

### 📜 Audit Trail

CartPilot records important transaction events, including:

- AI decision
- Guardrail result
- User approval
- Guardrail blocks
- Razorpay order creation
- Payment verification

This provides visibility into how a transaction was reached and what happened during execution.

---

### 🧯 Graceful Failure

CartPilot does not silently continue when something goes wrong.

Invalid recommendations, budget violations, price mismatches, payment failures, and other transaction problems result in an explicit failure state instead of an uncontrolled payment attempt.

---

# 🏗️ Architecture

```text
                    ┌──────────────────┐
                    │   AI Buyer/User  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Merchant Catalog │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │    AI Agent      │
                    │      Groq        │
                    └────────┬─────────┘
                             │
                             ▼
                 ┌─────────────────────────┐
                 │  Deterministic          │
                 │  Guardrails             │
                 │                         │
                 │  • Product validation  │
                 │  • Stock validation    │
                 │  • Price validation    │
                 │  • Budget validation   │
                 └────────────┬────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                 BLOCKED             PASSED
                    │                   │
                    ▼                   ▼
               🚫 Stop           👤 User Approval
                                        │
                                        ▼
                                💳 Razorpay Test
                                        │
                                        ▼
                               ✅ Signature Check
                                        │
                                        ▼
                                  📜 Audit Log
```

---

# 🧪 Example

Imagine a customer tells their AI buyer:

> "I need something to protect my backpack from rain and I don't want to spend more than ₹2,000."

CartPilot processes the request.

### Step 1 — AI Decision

The AI selects:

```text
Backpack Rain Cover
Price: ₹199
```

### Step 2 — Guardrails

The backend checks:

```text
✓ Product exists
✓ Product is in stock
✓ Price matches merchant catalog
✓ ₹199 is within the ₹2,000 budget
```

### Step 3 — User Approval

The user sees:

```text
Backpack Rain Cover
₹199

Safety checks passed.

[ Approve Purchase ]
[ Reject ]
```

### Step 4 — Payment

Only after approval does CartPilot create a Razorpay payment order.

### Step 5 — Verification

The backend verifies the Razorpay payment signature.

### Step 6 — Audit

The transaction is recorded in the audit trail.

---

# 🛡️ Security & Transaction Philosophy

CartPilot follows a simple principle:

> **The AI should be able to make a recommendation, but it should not have unrestricted authority over money.**

The responsibilities are separated:

| Component | Responsibility |
|---|---|
| 🤖 AI Agent | Understand intent and recommend a product |
| 🛡️ Guardrails | Deterministically validate the transaction |
| 👤 User | Explicitly authorize the purchase |
| 💳 Payment System | Process the payment |
| 📜 Audit Log | Record what happened |

This separation reduces the risk of an AI agent directly controlling financial actions.

---

# 🧰 Tech Stack

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- Node.js
- Express
- JavaScript

### AI

- Groq
- `openai/gpt-oss-20b`

### Payments

- Razorpay Test Mode

---

# 📁 Project Structure

```text
cartpilot/
│
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── index.css
│   ├── package.json
│   └── ...
│
├── .gitignore
├── README.md
└── ...
```

---

# ⚙️ Local Setup

## 1. Clone the repository

```bash
git clone https://github.com/Yash-0226/cartpilot.git
cd cartpilot
```

---

## 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` directory:

```env
GROQ_API_KEY=your_groq_api_key
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

> Never commit the `.env` file. It contains private API credentials.

---

## 3. Start the Backend

From the `backend` directory:

```bash
npm start
```

The backend runs on:

```text
http://localhost:5000
```

---

## 4. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

---

# 🔑 Environment Variables

The project requires:

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Access to the AI model |
| `RAZORPAY_KEY_ID` | Razorpay API authentication |
| `RAZORPAY_KEY_SECRET` | Server-side Razorpay verification |

A template is provided in:

```text
backend/.env.example
```

Actual credentials should remain in:

```text
backend/.env
```

and are excluded from Git using `.gitignore`.

---

# 🧪 Demo Scenarios

### ✅ Valid Purchase

```text
Budget: ₹2,000
Product: ₹199

→ Guardrails Passed
→ User Approval
→ Razorpay Order
→ Payment Verified
```

### ❌ Budget Violation

```text
Budget: ₹100
Product: ₹199

→ Guardrail Blocked
→ No Payment Order
```

### ❌ Price Tampering

```text
Merchant Price: ₹199
Attempted Price: ₹200

→ Price Mismatch
→ Transaction Blocked
```

### ❌ User Rejection

```text
Guardrails Passed
        ↓
User Rejects
        ↓
Transaction Stops
```

---

# 🎯 Challenge Alignment

CartPilot addresses the **AI Growth & Agentic Commerce** problem, particularly the goal of making merchants **transactible by AI buyers**.

The project demonstrates how an AI agent can move beyond simple product recommendation and participate in a controlled commerce transaction.

The implementation focuses on the core transaction-safety architecture:

- AI-driven product selection
- Merchant catalog grounding
- Deterministic transaction guardrails
- User approval
- Payment execution
- Server-side verification
- Auditability
- Graceful failure

The payment demonstration currently uses **Razorpay Test Mode**.

Protocol-level integrations such as **NPCI UAP, ACP/AP2, and x402** can be explored as future extensions of the transaction layer.

---

# 🔮 Future Roadmap

### v2

- Persistent database-backed audit logs
- Transaction/session IDs
- Idempotent payment operations
- Expanded merchant catalog
- Merchant analytics dashboard
- Stronger authentication and authorization

### Agentic Commerce Extensions

- AI buyer interoperability
- NPCI UAP integration
- ACP/AP2 compatibility
- x402-based transaction flows
- Multi-merchant discovery
- Automated purchasing policies

### Production Readiness

- Production payment infrastructure
- Secure authentication
- Database persistence
- Monitoring and observability
- Rate limiting
- Deployment infrastructure

---

# 🏆 Key Idea

CartPilot is not simply an AI shopping chatbot.

It is a **safety-controlled transaction layer for agentic commerce**.

> **AI decides. Guardrails verify. Users authorize. Payment executes. Everything is auditable.**

---

## 📄 License

This project is currently intended as a hackathon/educational project.