/* Basic SWM app */

var path = require('path');

var express = require('express');
var logger = require('morgan');

var swim = require('./');

var _config = null;

try {
  _config = require(process.env.CONFIG_FILE
        ? path.resolve(process.cwd(), process.env.CONFIG_FILE)
        : './config.json');
} catch (error) {
  console.error('Invalid config');
  process.exit(1);
}

function getPort() {
  return process.env.PORT || 3000;
}

var config = {
  root: process.argv[2] || _config.root || path.join(__dirname, 'content'),

  working:   path.join(__dirname, '.data'),
  published: path.join(__dirname, 'public', 'snapshot'),

  view: '402',

  'ttl': _config.ttl || 10,

  'content': {
    baseUri: (_config.baseUrl || 'http://localhost:' + getPort())
               + '/snapshot',
  },

  'payment': [],

  'validity': 3600,
};

var modules = [];

if (_config.payment) {
  _config.payment.forEach(function (option) {
    var network = option.network;

    var address = null;

    try {
      address = swim[network].addressFromKey(option.key);
    } catch (error) {
      console.error('WARNING: Invalid private key ' + option.key
          + '. Skipping.');
      return;
    }

    var amount = option.price;

    config['payment'].push({
      'network': network,
      'address': address,
      'amount':  amount
    });

    modules.push(swim[network](option.key));
  });
}

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
