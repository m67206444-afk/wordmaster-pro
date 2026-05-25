exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { prompt, token } = JSON.parse(event.body || "{}");
    if (!prompt) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing prompt" }) };
    if (!token || token !== process.env.PREMIUM_TOKEN) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const key = process.env.GEMINI_KEY;
    if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: "Server key not configured" }) };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
      }
    );
    const data = await res.json();
    if (data.error) return { statusCode: 500, headers, body: JSON.stringify({ error: data.error.message }) };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
