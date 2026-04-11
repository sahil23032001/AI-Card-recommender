function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-admin-secret");
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res, allowed = ["POST", "OPTIONS"]) {
  return sendJson(res, 405, { error: `Method not allowed. Allowed: ${allowed.join(", ")}` });
}

module.exports = { sendJson, methodNotAllowed };
