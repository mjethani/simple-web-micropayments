/* Basic SWM app */

var path = require('path');

var express = require('express');
var logger = require('morgan');

var swim = require('./');

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
    'address': swim[network].addressFromKey(option.key),
    'amount':  option.price
  });

  modules.push(swim[network](option.key));
});

var instance = swim(config);

instance.initialize(modules);
instance.run();

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', instance.router());

module.exports = app;

// vim: et ts=2 sw=2
