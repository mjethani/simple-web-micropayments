/* Basic SWM app */

var assert = require('assert');

var path = require('path');

var express = require('express');
var logger = require('morgan');

var swim = require('./');

var config = require(process.env.CONFIG_FILE || './config.json');

var network = (function () {
  if (Object.keys(config).indexOf('bitcoin') !== -1) {
    return 'Bitcoin';
  } else if (Object.keys(config).indexOf('ripple') !== -1) {
    return 'Ripple';
  }
})();

assert(network === 'Bitcoin' || network === 'Ripple');

var key = config[network.toLowerCase()].key;

var paymentsModule = swim[network](key);

var swimInstance = swim({
  root: path.join(__dirname, 'content'),

  working:   path.join(__dirname, '.data'),
  published: path.join(__dirname, 'public', 'snapshot'),

  'ttl': config.ttl || 60,

  'content': {
    baseUri: config.baseUrl + '/snapshot',
  },

  'payment': {
    'network': network,
    'address': swim[network].addressFromKey(key),
    'amount':  config[network.toLowerCase()].price
  },

  'validity': 3600,
});

swimInstance.initialize(paymentsModule);
swimInstance.run();

var app = express();

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(swimInstance.router());

module.exports = app;

// vim: et ts=2 sw=2
