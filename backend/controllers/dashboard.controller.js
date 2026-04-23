const dashboardService        = require("../services/dashboard.service");
const { sendJSON, sendError } = require("../utils/http");

async function getStats(req, res) {
  try {
    const stats = await dashboardService.getStats();
    sendJSON(res, 200, stats);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

module.exports = { getStats };

