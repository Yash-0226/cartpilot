import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [cart, setCart] = useState([]);
  const [backendMessage, setBackendMessage] = useState("");
  const [products, setProducts] = useState([]);
  const [userMessage, setUserMessage] = useState("");
  const [recommendation, setRecommendation] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [budget, setBudget] = useState(2000);

  // Load Razorpay Checkout
  useEffect(() => {
    const script = document.createElement("script");

    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;

    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Load backend data
  useEffect(() => {
    fetch("http://localhost:5000/api/test")
      .then((response) => response.json())
      .then((data) => {
        setBackendMessage(data.message);
      })
      .catch((error) => {
        console.error("Backend connection failed:", error);
      });

    fetch("http://localhost:5000/api/products")
      .then((response) => response.json())
      .then((data) => {
        setProducts(data);
      })
      .catch((error) => {
        console.error("Failed to load products:", error);
      });
  }, []);

  useEffect(() => {
  if (orderResult) {
    loadAuditLog();
  }
}, [orderResult]);

  function addToCart(product) {
    setCart([...cart, product]);
  }

  async function askAgent() {
    if (!userMessage.trim()) {
      return;
    }

    setLoading(true);
    setRecommendation(null);

    try {
      const response = await fetch("http://localhost:5000/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
  message: userMessage,
  budget: budget,
}),
      });

      const data = await response.json();

      if (!response.ok) {
  setRecommendation(null);

  setOrderResult({
    status: "error",
    message:
      "CartPilot AI is temporarily unavailable. Please try again.",
  });

  return;
}

      setRecommendation(data);
    } catch (error) {
      console.error("AI agent failed:", error);
      setRecommendation({
        error: "The AI agent is temporarily unavailable. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }


  async function approvePurchase() {
  if (!recommendation || isProcessingPayment) {
    return;
  }

  setIsProcessingPayment(true);

  try {
    const response = await fetch("http://localhost:5000/api/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: recommendation.decision.productId,
        price: recommendation.decision.price,
        budget: budget,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
  setOrderResult(data);
  setIsProcessingPayment(false);
  return;
}

    const options = {
      key: data.keyId,
      amount: data.order.amount * 100,
      currency: data.order.currency,
      name: "CartPilot",
      description: data.order.product,
      order_id: data.order.razorpayOrderId,

      handler: async function (paymentResponse) {
  try {
    const verifyResponse = await fetch(
      "http://localhost:5000/api/payment/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_signature: paymentResponse.razorpay_signature,
        }),
      }
    );

    const verifyData = await verifyResponse.json();

    if (!verifyResponse.ok) {
  setOrderResult({
    status: "verification_failed",
    message: verifyData.message || "Payment verification failed.",
  });

  setIsProcessingPayment(false);
  return;
}

    setOrderResult({
      status: "verified",
      message: "Payment completed and verified successfully.",
      order: {
        razorpayOrderId: paymentResponse.razorpay_order_id,
        paymentId: paymentResponse.razorpay_payment_id,
        product: data.order.product,
        amount: data.order.amount,
      },
    });
    setIsProcessingPayment(false);
  } catch (error) {
    console.error("Payment verification failed:", error);
    setIsProcessingPayment(false);

    setOrderResult({
      status: "error",
      message: "Payment completed, but verification could not be completed.",
    });
  }
},

      modal: {
        ondismiss: function () {
          setOrderResult({
            status: "payment_cancelled",
            message: "Payment was cancelled.",
          });
          setIsProcessingPayment(false);
        },
      },

      theme: {
        color: "#3399cc",
      },
    };

    const rzp = new window.Razorpay(options);

    rzp.open();
  } catch (error) {
    console.error("Payment failed:", error);

    setOrderResult({
      status: "error",
      message: "Could not start payment.",
    });
    setIsProcessingPayment(false);
  }
}

async function testGuardrailBlock() {
  if (!recommendation) {
    return;
  }

  try {
    const response = await fetch(
      "http://localhost:5000/api/approve",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: recommendation.decision.productId,

          // Intentionally tamper with the price
          price: recommendation.decision.price + 1,

          budget: budget,
        }),
      }
    );

    const data = await response.json();

    setOrderResult({
      status: data.status || "blocked",
      message:
        data.reason ||
        "Transaction was blocked by CartPilot guardrails.",
    });

    loadAuditLog();
  } catch (error) {
    console.error("Guardrail test failed:", error);

    setOrderResult({
      status: "error",
      message: "Could not test the guardrail.",
    });
  }
}

function rejectPurchase() {
  setOrderResult({
    status: "rejected",
    message: "Purchase rejected by user.",
  });
}

async function loadAuditLog() {
  try {
    const response = await fetch(
      "http://localhost:5000/api/audit-log"
    );

    const data = await response.json();

    setAuditLog(data);
  } catch (error) {
    console.error("Failed to load audit log:", error);
  }
}


  const cartTotal = cart.reduce((total, item) => total + item.price, 0);

  return (
  <div className="app">

    <header className="header">
      <div className="logo">
        Cart<span>Pilot</span>
      </div>

      <div className="header-badge">
        AI-Native Commerce
      </div>
    </header>

    <main className="container">

      <section className="hero">
        <h1>
          Shop smarter with <span>AI</span>
        </h1>

        <p>
          An AI shopping agent with built-in guardrails and secure payments.
        </p>
      </section>

     {backendMessage && (
  <div className="system-status">
    <span className="status-dot"></span>
    <strong>System Online</strong>
    <span>{backendMessage}</span>
  </div>
)}

      <div className="ai-card">
  <div className="ai-card-header">
    <div className="ai-icon">🤖</div>
    <div>
      <h2>CartPilot AI Assistant</h2>
      <p>Describe what you need and set your spending limit.</p>
    </div>
  </div>

  <label className="input-label">
    What are you looking for?
  </label>

  <input
    type="text"
    value={userMessage}
    onChange={(e) => setUserMessage(e.target.value)}
    placeholder="e.g. I need something to protect my backpack from rain"
  />

  <div className="budget-row">
    <div>
      <label className="input-label">
        Purchase Budget
      </label>

      <input
        type="number"
        value={budget}
        onChange={(e) => setBudget(Number(e.target.value))}
        min="1"
      />
    </div>

    <div className="budget-hint">
      <span>Spending limit</span>
      <strong>₹{budget}</strong>
    </div>
  </div>

  <button
    className="primary-btn ask-btn"
    onClick={askAgent}
    disabled={loading}
  >
    {loading ? "Thinking..." : "Ask CartPilot →"}
  </button>
</div>

      




  


      
<br></br>
      <div className="agent-flow">
  <span>🤖 AI Decision</span>
  <b>→</b>
  <span>🛡️ Guardrails</span>
  <b>→</b>
  <span>👤 Approval</span>
  <b>→</b>
  <span>💳 Payment</span>
</div>
<br></br>
<div className="flow-caption">
  Every purchase passes through deterministic safety checks.
</div>

      {recommendation && (
  <div className="recommendation">
    <h3>AI Recommendation</h3>

    {recommendation.error ? (
      <p>{recommendation.error}</p>
    ) : (
      <>
        <p>
          <strong>Product:</strong>{" "}
          {recommendation.guardrails.product.name}
        </p>

        <p className="price">
          ₹{recommendation.guardrails.product.price}
        </p>

        <p className="reason">
  <strong>Why:</strong>{" "}
  {recommendation.decision.reason}
</p>

<p>
  <strong>Budget:</strong> ₹{budget}
  {" · "}
  <strong>Product Price:</strong> ₹{recommendation.guardrails.product.price}
</p>

<div
  className="guardrail"
  style={{
    background:
      recommendation.guardrails.approved
        ? "#ecfdf3"
        : "#fef2f2",
    color:
      recommendation.guardrails.approved
        ? "#027a48"
        : "#b42318",
    border:
      recommendation.guardrails.approved
        ? "1px solid #abefc6"
        : "1px solid #fecdca",
  }}
>
  {recommendation.guardrails.approved ? "✓" : "🛡️"}{" "}
  {recommendation.guardrails.reason}
</div>

        {recommendation.guardrails.approved &&
          recommendation.guardrails.requiresApproval && (
            <div className="button-row">
              <button
  className="approve-btn"
  onClick={approvePurchase}
  disabled={isProcessingPayment}
>
  {isProcessingPayment
    ? "Processing..."
    : "✓ Approve Purchase"}
</button>
              <button
  className="reject-btn"
  onClick={testGuardrailBlock}
  disabled={isProcessingPayment}
>
  🛡️ Test Guardrail Block
</button>
              <button
                className="reject-btn"
                onClick={rejectPurchase}
              >
                Reject
              </button>
            </div>
          )}
      </>
    )}
  </div>
)}

{orderResult && (
  <div
    className={
      orderResult.status === "verified"
        ? "card transaction-success"
        : orderResult.status === "payment_cancelled"
        ? "card transaction-cancelled"
        : "card transaction-error"
    }
  >
    <h2 className="card-title">💳 Transaction Result</h2>

    <p>
  <strong>Status:</strong>{" "}
  {orderResult.status === "verified"
    ? "✓ PAYMENT VERIFIED"
    : orderResult.status.toUpperCase()}
</p>

    <p>{orderResult.message}</p>

    {orderResult.order && (
      <>
        <p>
          <strong>Order ID:</strong> {orderResult.order.razorpayOrderId}
        </p>

        <p>
          <strong>Product:</strong> {orderResult.order.product}
        </p>

        <p>
          <strong>Amount:</strong> ₹{orderResult.order.amount}
        </p>
      </>
    )}
  </div>
)}


      <hr />

      <h2 className="card-title">🛍️ Products</h2>

<div className="products-grid">
  {products.map((product) => (
    <div className="product-card" key={product.id}>
      <h3>{product.name}</h3>

      <p className="product-price">
        ₹{product.price}
      </p>

      <p className="product-description">
        {product.description}
      </p>

      <p className="stock">
        {product.category} · {product.stock} in stock
      </p>

      <button
        className="primary-btn"
        onClick={() => addToCart(product)}
      >
        Add to Cart
      </button>
    </div>
  ))}
</div>
      <hr />

      {cart.length > 0 && (
  <>
    <hr />

    <section className="cart-section">
      <h2>🛒 Cart</h2>

      {cart.map((item, index) => (
        <p key={index}>
          {item.name} — ₹{item.price}
        </p>
      ))}

      <h3>Total: ₹{cartTotal}</h3>

      <button className="primary-btn">
        Checkout
      </button>
    </section>
  </>
)}

<div className="card audit-card">
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
    }}
  >
    <div>
      <h2 className="card-title">🔐 Audit Trail</h2>
      <p style={{ color: "#667085", margin: 0 }}>
        Complete record of AI decisions and payment actions.
      </p>
    </div>

    <button
      className="primary-btn"
      onClick={loadAuditLog}
    >
      ↻ Refresh
    </button>
  </div>

  {auditLog.length === 0 ? (
    <p style={{ color: "#667085" }}>
      No audit events yet.
    </p>
  ) : (
    auditLog.map((entry, index) => (
      <div className="audit-entry" key={index}>
        <div className="audit-type">
          {entry.type === "AI_DECISION" && "🤖 "}
          {entry.type === "GUARDRAIL_CHECK" && "🛡️ "}
          {entry.type === "GUARDRAIL_BLOCKED" && "🚫 "}
          {entry.type === "USER_APPROVAL" && "👤 "}
          {entry.type === "RAZORPAY_ORDER" && "💳 "}
          {entry.type === "PAYMENT_VERIFICATION" && "✓ "}

          {entry.type.replaceAll("_", " ")}
        </div>

        <div className="audit-time">
          {new Date(entry.timestamp).toLocaleString()}
        </div>

        <pre>
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      </div>
    ))
  )}
</div>
        </main>
  </div>
  );
}

export default App;
