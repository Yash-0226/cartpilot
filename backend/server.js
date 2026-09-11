require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const app = express();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "CartPilot backend is running",
  });
});

app.get("/api/test", (req, res) => {
  res.json({
    message: "Hello from CartPilot backend!",
  });
});

const products = [
  {
    id: 1,
    name: "Urban Backpack",
    price: 1799,
    description: "Waterproof • 25L • Laptop compartment",
    category: "Bags",
    stock: 20,
  },
  {
    id: 2,
    name: "Backpack Rain Cover",
    price: 199,
    description: "Waterproof protective cover",
    category: "Accessories",
    stock: 50,
  },
];

const auditLog = [];

function addAuditLog(type, details) {
  auditLog.push({
    timestamp: new Date().toISOString(),
    type,
    details,
  });
}


app.get("/api/products", (req, res) => {
  res.json(products);
});
function checkGuardrails(decision, budget) {
  const product = products.find(
    (item) => item.id === decision.productId
  );

  // Rule 1: Product must exist
  if (!product) {
    return {
      approved: false,
      reason: "Product does not exist in the merchant catalog.",
    };
  }

  // Rule 2: Product must be in stock
  if (product.stock <= 0) {
    return {
      approved: false,
      reason: "Product is out of stock.",
    };
  }

  // Rule 3: AI price must match merchant price
  if (decision.price !== product.price) {
  return {
    approved: false,
    reason: "Price mismatch detected.",
    product,
  };
}

  // Rule 4: Purchase must be within budget
  if (product.price > budget) {
  return {
    approved: false,
    reason: `Purchase exceeds the ₹${budget} budget.`,
    product,
  };
}

  // All checks passed
  return {
  approved: true,
  requiresApproval: true,
  reason: "All guardrail checks passed. User approval is required before purchase.",
  product,
};
}

////////
app.post("/api/agent", async (req, res) => {
  try {
    const { message, budget } = req.body;
    if (
  typeof budget !== "number" ||
  !Number.isFinite(budget) ||
  budget <= 0
) {
  return res.status(400).json({
    error: "Invalid purchase budget.",
  });
}

if (
  typeof budget !== "number" ||
  !Number.isFinite(budget) ||
  budget <= 0
) {
  return res.status(400).json({
    error: "Invalid purchase budget.",
  });
}

auditLog.length = 0;
    const response = await groq.chat.completions.create({
  model: "openai/gpt-oss-20b",

  messages: [
    {
      role: "system",
      content: `
You are CartPilot, an AI shopping assistant.

Your job is to understand the customer's request and select the
most suitable product from the merchant catalog.

Merchant catalog:
${JSON.stringify(products, null, 2)}

Rules:
- Only recommend products that exist in the catalog.
- Use the product ID from the catalog.
- Use the exact price from the catalog.
- Do not invent products.
- Keep the reason short and clear.

Return ONLY valid JSON in this exact format:
{
  "action": "recommend",
  "productId": 1,
  "reason": "short explanation",
  "price": 1799
}
      `,
    },
    {
      role: "user",
      content: message,
    },
  ],

  response_format: {
    type: "json_object",
  },
});

const decision = JSON.parse(
  response.choices[0].message.content
);

if (
  typeof decision.productId !== "number" ||
  typeof decision.price !== "number" ||
  typeof decision.reason !== "string" ||
  decision.action !== "recommend"
) {
  throw new Error("Invalid AI decision returned by Groq");
}

const guardrailResult = checkGuardrails(decision, budget);

// Record AI decision
addAuditLog("AI_DECISION", {
  productId: decision.productId,
  product: guardrailResult.product?.name || "Unknown",
  price: decision.price,
  reason: decision.reason,
});

// Record guardrail result
addAuditLog("GUARDRAIL_CHECK", {
  approved: guardrailResult.approved,
  reason: guardrailResult.reason,
  budget,
});

res.json({
  decision,
  guardrails: guardrailResult,
});


  } catch (error) {
    console.error("Groq AI error:", error);

    res.status(500).json({
      error: "AI agent failed",
    });
  }
});


app.post("/api/approve", async (req, res) => {
  try {
    const { productId, price, budget } = req.body;

    const decision = {
      productId,
      price,
    };

    // Run guardrails again before creating the order
    const guardrailResult = checkGuardrails(
      decision,
      budget || 2000
    );

    // Block if any guardrail fails
if (!guardrailResult.approved) {

  addAuditLog("GUARDRAIL_BLOCKED", {
    productId,
    attemptedPrice: price,
    reason: guardrailResult.reason,
    budget: budget || 2000,
  });

  return res.status(403).json({
    status: "blocked",
    reason: guardrailResult.reason,
  });
}

    const product = guardrailResult.product;

    addAuditLog("USER_APPROVAL", {
  productId: product.id,
  product: product.name,
  amount: product.price,
});

    // Create Razorpay Test Mode order
    const razorpayOrder = await razorpay.orders.create({
      amount: product.price * 100,
      currency: "INR",
      receipt: "CP-" + Date.now(),
    });
    addAuditLog("RAZORPAY_ORDER", {
  orderId: razorpayOrder.id,
  product: product.name,
  amount: product.price,
  currency: "INR",
});


    res.json({
      status: "approved",
      message: "Payment order created successfully.",
      order: {
        razorpayOrderId: razorpayOrder.id,
        product: product.name,
        amount: product.price,
        currency: "INR",
      },
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);

    res.status(500).json({
      error: "Could not create payment order",
    });
  }
});


const PORT = 5000;

app.post("/api/payment/verify", (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // Create the signature that Razorpay expects
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    // Compare Razorpay's signature with our generated signature
    if (generatedSignature !== razorpay_signature) {
  addAuditLog("PAYMENT_VERIFICATION", {
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    status: "FAILED",
    reason: "Invalid payment signature",
  });

  return res.status(400).json({
    status: "verification_failed",
    message: "Payment signature verification failed.",
  });
}

// Payment is genuine
addAuditLog("PAYMENT_VERIFICATION", {
  orderId: razorpay_order_id,
  paymentId: razorpay_payment_id,
  status: "VERIFIED",
});

res.json({
  status: "verified",
  message: "Payment verified successfully.",
  paymentId: razorpay_payment_id,
  orderId: razorpay_order_id,
});

  } catch (error) {
    console.error("Payment verification failed:", error);

    res.status(500).json({
      status: "error",
      message: "Could not verify payment.",
    });
  }
});

app.get("/api/audit-log", (req, res) => {
  res.json(auditLog);
});

app.listen(PORT, () => {
  console.log(`CartPilot backend running on http://localhost:${PORT}`);
});