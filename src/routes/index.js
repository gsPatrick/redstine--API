"use strict";

const { Router } = require("express");
const { sequelize } = require("../config/database");

const authRoutes = require("../features/auth/auth.routes");
const usersRoutes = require("../features/users/users.routes");
const catalogRoutes = require("../features/catalog/catalog.routes");
const assetsRoutes = require("../features/assets/assets.routes");
const submissionsRoutes = require("../features/submissions/submissions.routes");
const ordersRoutes = require("../features/orders/orders.routes");
const quotesRoutes = require("../features/quotes/quotes.routes");
const wishlistRoutes = require("../features/wishlist/wishlist.routes");
const meRoutes = require("../features/me/me.routes");
const payoutsRoutes = require("../features/payouts/payouts.routes");
const uploadsRoutes = require("../features/uploads/uploads.routes");
const eventsRoutes = require("../features/events/events.routes");
const auditRoutes = require("../features/audit/audit.routes");
const notificationsRoutes = require("../features/notifications/notifications.routes");
const managementRoutes = require("../features/management/management.routes");
const paymentsRoutes = require("../features/payments/payments.routes");

const router = Router();

/** Probes de orquestracao — unicos endpoints fora de uma feature. */
router.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

router.get("/v1/ping", async (req, res) => {
  let db = "down";
  try {
    await sequelize.authenticate();
    db = "up";
  } catch {
    db = "down";
  }
  res.status(db === "up" ? 200 : 503).json({ status: "ok", db, time: new Date().toISOString() });
});

// Agregacao unica da v1.
router.use("/v1/auth", authRoutes);
router.use("/v1/users", usersRoutes);
router.use("/v1/catalog", catalogRoutes);
router.use("/v1/assets", assetsRoutes);
router.use("/v1/submissions", submissionsRoutes);
router.use("/v1/orders", ordersRoutes);
router.use("/v1/quotes", quotesRoutes);
router.use("/v1/wishlist", wishlistRoutes);
router.use("/v1/me", meRoutes);
router.use("/v1/payouts", payoutsRoutes);
router.use("/v1/uploads", uploadsRoutes);
router.use("/v1/events", eventsRoutes);
router.use("/v1/audit", auditRoutes);
router.use("/v1/notifications", notificationsRoutes);
router.use("/v1/management", managementRoutes);
router.use("/v1/payments", paymentsRoutes);

module.exports = router;
