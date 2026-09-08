"use strict";

const service = require("./audit.service");
const { catchAsync } = require("../../utils/catch-async");
const { paginated } = require("../../utils/http-response");

const historico = catchAsync(async (req, res) => {
  const r = await service.historico(req.params.entity, req.params.entityId, req.query);
  paginated(res, r, { page: r.page, perPage: r.perPage });
});

module.exports = { historico };
