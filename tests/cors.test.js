"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

/**
 * A leitura das origens é feita no módulo de ambiente, então cada caso precisa
 * de um require limpo — daí o cache ser esvaziado a cada teste.
 */
function origensCom(valores) {
  const antes = { cors: process.env.CORS_ORIGINS, site: process.env.APP_SITE_URL };
  Object.assign(process.env, valores);
  for (const k of Object.keys(require.cache)) {
    if (k.includes("config/env") || k.includes("middlewares/cors")) delete require.cache[k];
  }
  const { env } = require("../src/config/env");
  const resultado = env.cors.origins;
  process.env.CORS_ORIGINS = antes.cors;
  process.env.APP_SITE_URL = antes.site;
  return resultado;
}

describe("origens permitidas", () => {
  test("o site configurado entra sozinho na lista", () => {
    const o = origensCom({ CORS_ORIGINS: "https://a.com", APP_SITE_URL: "https://site.com" });
    assert.ok(o.includes("https://site.com"));
    assert.ok(o.includes("https://a.com"));
  });

  test("barra final do site não vira uma origem diferente", () => {
    // "https://site.com/" e "https://site.com" são a mesma origem para o
    // navegador, mas seriam strings diferentes numa comparação ingênua.
    const o = origensCom({ CORS_ORIGINS: "", APP_SITE_URL: "https://site.com/" });
    assert.ok(o.includes("https://site.com"));
  });

  test("o curinga é reconhecido", () => {
    assert.ok(origensCom({ CORS_ORIGINS: "*", APP_SITE_URL: "" }).includes("*"));
  });

  test("valores vazios não viram origem", () => {
    const o = origensCom({ CORS_ORIGINS: "https://a.com,,", APP_SITE_URL: "" });
    assert.ok(!o.includes(""));
  });
});
