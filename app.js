/* Basic SWM app */

var assert = require('assert');

var path = require('path');

var express = require('express');
var logger = require('morgan');

var swim = require('./');

var config = require(process.env.CONFIG_FILE || './config.json');

var swimConfig = {
  root: path.join(__dirname, 'content'),

  working:   path.join(__dirname, '.data'),
  published: path.join(__dirname, 'public', 'snapshot'),

  view: '402',

  'ttl': config.ttl || 60,

  'content': {
    baseUri: config.baseUrl + '/snapshot',
  },

  'payment': [],

  'validity': 3600,
};

var modules = [];

config.payment.forEach(function (option) {
  var network = option.network;

  swimConfig['payment'].push({
    'network': network,
    'address': swim[network].addressFromKey(option.key),
    'amount':  option.price
  });

  modules.push(swim[network](option.key));
});

var swimInstance = swim(swimConfig);

swimInstance.initialize(modules);
swimInstance.run();

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(swimInstance.router());

module.exports = app;

// vim: et ts=2 sw=2
