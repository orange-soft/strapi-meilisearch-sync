'use strict';

const svc = (strapi) => strapi.plugin('search-sync').service('search-sync');

module.exports = ({ strapi }) => ({
  async status(ctx) {
    ctx.body = await svc(strapi).status();
  },
  async preview(ctx) {
    const { uid, documentId } = ctx.query;
    if (!uid) return ctx.badRequest('uid query param required');
    ctx.body = await svc(strapi).preview({ uid, documentId });
  },
  async entries(ctx) {
    const { uid } = ctx.query;
    if (!uid) return ctx.badRequest('uid query param required');
    ctx.body = await svc(strapi).entries({ uid });
  },
  async reindex(ctx) {
    const { uid } = ctx.request.body || {};
    ctx.body = await svc(strapi).reindex({ uid });
  },
  async schema(ctx) {
    ctx.body = svc(strapi).introspect();
  },
  async getConfig(ctx) {
    ctx.body = await svc(strapi).getConfig();
  },
  async saveConfig(ctx) {
    try {
      ctx.body = await svc(strapi).saveConfig(ctx.request.body);
    } catch (e) {
      ctx.badRequest(e.message);
    }
  },
  async resetConfig(ctx) {
    ctx.body = await svc(strapi).resetConfig();
  },
  async getSettings(ctx) {
    ctx.body = await svc(strapi).getSettings();
  },
  async saveSettings(ctx) {
    try {
      ctx.body = await svc(strapi).saveSettings(ctx.request.body || {});
    } catch (e) {
      ctx.badRequest(e.message);
    }
  },
  async health(ctx) {
    ctx.body = await svc(strapi).health();
  },
  async generateKey(ctx) {
    try {
      const { adminKey, scope } = ctx.request.body || {};
      ctx.body = await svc(strapi).generateKey({ adminKey, scope });
    } catch (e) {
      ctx.badRequest(e.message);
    }
  },
  async runSearch(ctx) {
    ctx.body = await svc(strapi).runSearch(ctx.request.body || {});
  },
});
