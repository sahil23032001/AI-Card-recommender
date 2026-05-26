// api/recommend.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const BACKEND_URL = process.env.BACKEND_URL;
  const FRONTEND_PROXY_SECRET = process.env.FRONTEND_PROXY_SECRET;

  if (!BACKEND_URL || !FRONTEND_PROXY_SECRET) {
    return res.status(500).json({
      error: "Server configuration error",
      details: {
        BACKEND_URL: BACKEND_URL ? "set" : "missing",
        FRONTEND_PROXY_SECRET: FRONTEND_PROXY_SECRET ? "set" : "missing"
      }
    });
  }

  try {
    const body = req.body || {};

    const expenseTypeMap = {
      Shopping: "shopping",
      Dining: "dining",
      Travel: "travel",
      Hotel: "hotel",
      Movies: "movies",
      Fuel: "fuel",
      Grocery: "grocery",
      Online: "online"
    };

    const outputMap = {
      Cashback: "cashback",
      "Shopping Rewards": "shopping",
      "Dining Rewards": "dining",
      "Travel Points": "travel",
      "Hotel Benefits": "hotel",
      "Movie Tickets": "movie",
      "Fuel Savings": "fuel",
      "Lounge Access": "lounge",
      "General Rewards": "rewards"
    };

    const payload = {
      monthly_expense: Number(body.monthly_expense ?? body.expense),
      expense_type:
        expenseTypeMap[body.expense_type] ||
        expenseTypeMap[body.expenseType] ||
        String(body.expense_type || body.expenseType || "general").toLowerCase(),

      desired_output:
        outputMap[body.desired_output] ||
        outputMap[body.desiredOutput] ||
        String(body.desired_output || body.desiredOutput || "general").toLowerCase(),

      max_annual_fee: Number(body.max_annual_fee ?? body.maxFee),
      credit_score: Number(body.credit_score ?? body.creditScore),
      use_cache: body.use_cache ?? false,
      debug: body.debug ?? false
    };

    console.log("Proxy received:", body);
    console.log("Proxy forwarding:", payload);

    const backendResponse = await fetch(`${BACKEND_URL}/recommend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-frontend-proxy-secret": FRONTEND_PROXY_SECRET
      },
      body: JSON.stringify(payload)
    });

    const data = await backendResponse.json();

    if (!backendResponse.ok) {
      return res.status(backendResponse.status).json({
        error: "Backend returned error",
        backend_status: backendResponse.status,
        backend_response: data,
        forwarded_payload: payload
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error("Proxy error:", error);

    return res.status(500).json({
      error: "Failed to process recommendation request",
      message: error.message
    });
  }
}
