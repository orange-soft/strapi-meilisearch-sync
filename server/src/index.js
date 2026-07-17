'use strict';

const register = require('./register');
const bootstrap = require('./bootstrap');
const controllers = require('./controllers');
const routes = require('./routes');
const services = require('./services');

module.exports = {
  register,
  bootstrap,
  destroy() {},
  config: {
    default: {},
    validator() {},
  },
  controllers,
  routes,
  services,
  contentTypes: {},
  policies: {},
  middlewares: {},
};
