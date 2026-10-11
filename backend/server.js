const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const PORT = 5000;
const DATABASE_NAME = "cartpilot";

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is missing from backend/.env");
}

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is missing from backend/.env");
}

if (
  !process.env.RAZORPAY_KEY_ID ||
  !process.env.RAZORPAY_KEY_SECRET
) {
  throw new Error("Razorpay credentials are missing from backend/.env");
}

const mongoClient = new MongoClient(mongoUri);

let auditCollection;
let sessionsCollection;

const app = express();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.use(cors());
app.use(express.json({ limit: "100kb" }));

// --------------------------------------------------
// BASIC ROUTES
// --------------------------------------------------

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

// --------------------------------------------------
// MERCHANT CATALOG
// --------------------------------------------------

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

app.get("/api/products", (req, res) => {
  res.json(products);
});

// --------------------------------------------------
// AUDIT LOGGING
// --------------------------------------------------

async function addAuditLog(type, details, sessionId = null) {
  if (!auditCollection) {
    throw new Error("Audit database is not connected");
  }

  await auditCollection.insertOne({
    sessionId,
    timestamp: new Date().toISOString(),
    type,
    details,
  });
}

// --------------------------------------------------
// GUARDRAILS
// --------------------------------------------------

function checkGuardrails(decision, budget) {
  const product = products.find(
    (item) => item.id === decision.productId
  );

  if (!product) {
    return {
      approved: false,
      reason: "Product does not exist in the merchant catalog.",
    };
  }

  if (product.stock <= 0) {
    return {
      approved: false,
      reason: "Product is out of stock.",
      product,
    };
  }

  if (decision.price !== product.price) {
    return {
      approved: false,
      reason: "Price mismatch detected.",
      product,
    };
  }

  if (product.price > budget) {
    return {
      approved: false,
      reason: `Purchase exceeds the ₹${budget} budget.`,
      product,
    };
  }

  return {
    approved: true,
    requiresApproval: true,
    reason:
      "All guardrail checks passed. User approval is required before purchase.",
    product,
  };
}

// --------------------------------------------------
// AI AGENT
// --------------------------------------------------

app.post("/api/agent", async (req, res) => {
  try {
    const { message, budget } = req.body;

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 2000
    ) {
      return res.status(400).json({
        error: "Please provide a valid shopping request.",
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

    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content: `
You are CartPilot, an AI shopping assistant.

Select the most suitable product from this merchant catalog.

Merchant catalog:
${JSON.stringify(products, null, 2)}

Rules:
- Only recommend products that exist in the catalog.
- Use the exact product ID and price from the catalog.
- Never invent products or prices.
- Keep the reason short and clear.

Return ONLY valid JSON in this format:
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
          content: message.trim(),
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
    const sessionId = crypto.randomUUID();
    const now = new Date();

    // Store the shopping attempt persistently.
    await sessionsCollection.insertOne({
      sessionId,
      status: "RECOMMENDED",
      decision,
      budget,
      productId: decision.productId,
      price: decision.price,
      createdAt: now,
      updatedAt: now,
    });

    await addAuditLog(
      "AI_DECISION",
      {
        productId: decision.productId,
        product: guardrailResult.product?.name || "Unknown",
        price: decision.price,
        reason: decision.reason,
      },
      sessionId
    );

    await addAuditLog(
      "GUARDRAIL_CHECK",
      {
        approved: guardrailResult.approved,
        reason: guardrailResult.reason,
        budget,
      },
      sessionId
    );

    res.json({
      sessionId,
      decision,
      guardrails: guardrailResult,
    });
  } catch (error) {
    console.error("AI agent error:", error.message);

    res.status(500).json({
      error: "AI agent failed",
    });
  }
});

// --------------------------------------------------
// APPROVAL AND IDEMPOTENCY
// --------------------------------------------------

app.post("/api/approve", async (req, res) => {
  const { sessionId, productId, price, budget } = req.body;

  if (
    typeof sessionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sessionId
    )
  ) {
    return res.status(400).json({
      error: "A valid sessionId is required.",
    });
  }

  let claimed = false;

  try {
    const session = await sessionsCollection.findOne({
      sessionId,
    });

    if (!session) {
      return res.status(404).json({
        error: "Purchase session not found.",
      });
    }

    // Never allow the client to change the recommendation.
    if (
      productId !== session.productId ||
      price !== session.price ||
      budget !== session.budget
    ) {
      await addAuditLog(
        "GUARDRAIL_BLOCKED",
        {
          reason: "Request does not match the stored purchase session.",
          attemptedProductId: productId,
          attemptedPrice: price,
          attemptedBudget: budget,
        },
        sessionId
      );

      return res.status(403).json({
        status: "blocked",
        reason: "Purchase details do not match the recommendation.",
      });
    }

    // An existing order is reused for duplicate requests.
    if (session.razorpayOrderId) {
      if (session.status === "VERIFIED") {
        return res.status(409).json({
          status: "already_verified",
          error: "This purchase session has already been verified.",
        });
      }

      return res.json({
        status: "approved",
        message: "Existing payment order reused.",
        order: {
          razorpayOrderId: session.razorpayOrderId,
          product: session.productName,
          amount: session.price,
          currency: "INR",
        },
        keyId: process.env.RAZORPAY_KEY_ID,
        sessionId,
        reused: true,
      });
    }

    // Claim this session atomically to block concurrent approvals.
    const claim = await sessionsCollection.updateOne(
      {
        sessionId,
        status: "RECOMMENDED",
        razorpayOrderId: { $exists: false },
      },
      {
        $set: {
          status: "PROCESSING",
          updatedAt: new Date(),
        },
      }
    );

    if (claim.modifiedCount !== 1) {
      return res.status(409).json({
        status: "processing",
        error:
          "This purchase session is already being processed or is no longer approvable.",
      });
    }

    claimed = true;

    // Recheck the merchant's current catalog and budget.
    const guardrailResult = checkGuardrails(
      {
        productId: session.productId,
        price: session.price,
      },
      session.budget
    );

    if (!guardrailResult.approved) {
      await sessionsCollection.updateOne(
        {
          sessionId,
          status: "PROCESSING",
        },
        {
          $set: {
            status: "BLOCKED",
            updatedAt: new Date(),
          },
        }
      );

      await addAuditLog(
        "GUARDRAIL_BLOCKED",
        {
          productId: session.productId,
          attemptedPrice: session.price,
          reason: guardrailResult.reason,
          budget: session.budget,
        },
        sessionId
      );

      return res.status(403).json({
        status: "blocked",
        reason: guardrailResult.reason,
      });
    }

    const product = guardrailResult.product;

    // Create a Razorpay Test Mode order.
    const razorpayOrder = await razorpay.orders.create({
      amount: product.price * 100,
      currency: "INR",
      receipt: `CP-${sessionId}`,
    });

    // Persist the order before returning it to the frontend.
    await sessionsCollection.updateOne(
      {
        sessionId,
        status: "PROCESSING",
      },
      {
        $set: {
          status: "ORDER_CREATED",
          razorpayOrderId: razorpayOrder.id,
          productName: product.name,
          price: product.price,
          updatedAt: new Date(),
        },
      }
    );

    await addAuditLog(
      "USER_APPROVAL",
      {
        productId: product.id,
        product: product.name,
        amount: product.price,
      },
      sessionId
    );

    await addAuditLog(
      "RAZORPAY_ORDER",
      {
        orderId: razorpayOrder.id,
        product: product.name,
        amount: product.price,
        currency: "INR",
      },
      sessionId
    );

    return res.json({
      status: "approved",
      message: "Payment order created successfully.",
      order: {
        razorpayOrderId: razorpayOrder.id,
        product: product.name,
        amount: product.price,
        currency: "INR",
      },
      keyId: process.env.RAZORPAY_KEY_ID,
      sessionId,
      reused: false,
    });
  } catch (error) {
    console.error("Approval failed:", error.message);

    // Only release a claim when no order ID was saved.
    // If the external order creation outcome is uncertain, do not
    // automatically retry and risk creating another order.
    if (claimed) {
      try {
        const currentSession =
          await sessionsCollection.findOne({ sessionId });

        if (
          currentSession &&
          !currentSession.razorpayOrderId &&
          currentSession.status === "PROCESSING"
        ) {
          await sessionsCollection.updateOne(
            {
              sessionId,
              status: "PROCESSING",
              razorpayOrderId: { $exists: false },
            },
            {
              $set: {
                status: "APPROVAL_ERROR",
                updatedAt: new Date(),
              },
            }
          );
        }
      } catch (recoveryError) {
        console.error(
          "Could not update approval recovery state:",
          recoveryError.message
        );
      }
    }

    return res.status(500).json({
      error:
        "Approval could not be completed. Check the purchase session before retrying.",
    });
  }
});

// --------------------------------------------------
// PAYMENT VERIFICATION
// --------------------------------------------------

app.post("/api/payment/verify", async (req, res) => {
  try {
    const {
      sessionId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      typeof sessionId !== "string" ||
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return res.status(400).json({
        status: "verification_failed",
        message: "Missing payment verification fields.",
      });
    }

    const session = await sessionsCollection.findOne({
      sessionId,
      razorpayOrderId: razorpay_order_id,
    });

    if (!session) {
      return res.status(400).json({
        status: "verification_failed",
        message: "Payment order does not match this purchase session.",
      });
    }

    // Make repeated verification of the same payment idempotent.
    if (
      session.status === "VERIFIED" &&
      session.paymentId === razorpay_payment_id
    ) {
      return res.json({
        status: "verified",
        message: "Payment was already verified.",
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        sessionId,
        reused: true,
      });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expected = Buffer.from(generatedSignature, "hex");
    const received = Buffer.from(razorpay_signature, "hex");

    const validSignature =
      /^[0-9a-f]{64}$/i.test(razorpay_signature) &&
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received);

    if (!validSignature) {
      await addAuditLog(
        "PAYMENT_VERIFICATION",
        {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          status: "FAILED",
          reason: "Invalid payment signature",
        },
        sessionId
      );

      return res.status(400).json({
        status: "verification_failed",
        message: "Payment signature verification failed.",
      });
    }

    const updateResult = await sessionsCollection.updateOne(
      {
        sessionId,
        razorpayOrderId: razorpay_order_id,
        status: "ORDER_CREATED",
      },
      {
        $set: {
          status: "VERIFIED",
          paymentId: razorpay_payment_id,
          updatedAt: new Date(),
        },
      }
    );

    if (updateResult.modifiedCount !== 1) {
      const latestSession = await sessionsCollection.findOne({
        sessionId,
        razorpayOrderId: razorpay_order_id,
      });

      if (
        latestSession?.status === "VERIFIED" &&
        latestSession.paymentId === razorpay_payment_id
      ) {
        return res.json({
          status: "verified",
          message: "Payment was already verified.",
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          sessionId,
          reused: true,
        });
      }

      return res.status(409).json({
        status: "verification_failed",
        message: "Purchase session is not ready for verification.",
      });
    }

    await addAuditLog(
      "PAYMENT_VERIFICATION",
      {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        status: "VERIFIED",
      },
      sessionId
    );

    return res.json({
      status: "verified",
      message: "Payment verified successfully.",
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      sessionId,
      reused: false,
    });
  } catch (error) {
    console.error("Payment verification failed:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Could not verify payment.",
    });
  }
});

// --------------------------------------------------
// AUDIT LOG API
// --------------------------------------------------

app.get("/api/audit-log", async (req, res) => {
  try {
    const logs = await auditCollection
      .find({})
      .sort({ _id: -1 })
      .limit(200)
      .toArray();

    res.json(logs);
  } catch (error) {
    console.error("Failed to fetch audit logs:", error.message);

    res.status(500).json({
      error: "Could not fetch audit logs",
    });
  }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

async function startServer() {
  try {
    await mongoClient.connect();

    const database = mongoClient.db(DATABASE_NAME);

    auditCollection = database.collection("audit_logs");
    sessionsCollection = database.collection("purchase_sessions");

    await sessionsCollection.createIndex(
      { sessionId: 1 },
      { unique: true }
    );

    console.log("Connected to MongoDB Atlas");

    app.listen(PORT, () => {
      console.log(
        `CartPilot backend running on http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Failed to start CartPilot:", error.message);
    process.exit(1);
  }
}

startServer();