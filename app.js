/* Basic SWM app */

var assert = require('assert');

var path = require('path');

var express = require('express');
var logger = require('morgan');

var swm = require('./');

var appConfig = require(process.env.CONFIG_FILE || './config.json');

var config = {
  root: path.join(__dirname, 'content'),

  working:   path.join(__dirname, '.data'),
  published: path.join(__dirname, 'public', 'snapshot'),

  view: '402',

  'ttl': appConfig.ttl || 60,

  'content': {
    baseUri: appConfig.baseUrl + '/snapshot',
  },

  'payment': [],

  'validity': 3600,
};

var modules = [];

appConfig.payment.forEach(function (option) {
  var network = option.network;

  config['payment'].push({
    'network': network,
    'address': swm[network].addressFromKey(option.key),
    'amount':  option.price
  });

  modules.push(swm[network](option.key));
});

var m = swm(config);

m.initialize(modules);
m.run();

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(m.router());

module.exports = app;

// vim: et ts=2 sw=2
