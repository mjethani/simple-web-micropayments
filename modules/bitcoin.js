/* Bitcoin module */

var crypto = require('crypto');
var events = require('events');
var https  = require('https');
var util   = require('util');

var BigInteger = require('bigi');
var ecurve = require('ecurve');

var bitcoin = require('bitcoinjs-lib');

var ecparams = ecurve.getCurveByName('secp256k1');

var api = 'https://mainnet.helloblock.io/v1/';

function callApi(url, callback) {
  https.get(url, function (response) {
    if (response.statusCode === 200) {
      var data = '';

      response.on('data', function (chunk) {
        data += chunk;
      });

      response.on('end', function () {
        try {
          data = JSON.parse(data);
        } catch (error) {
        }
        callback(data);
      });

    } else {
      callback();
    }
  }).on('error', function (error) {
    callback();
  });
}

var _class = function (config) {
  this.config = config;

  this._key = bitcoin.ECKey.fromWIF(config.key);
  this._address = this._key.pub.getAddress().toString();

  this._offset = 0;
  this._limit = 1000;
};

util.inherits(_class, events.EventEmitter);

_class.prototype.network = function () {
  return 'Bitcoin';
};

_class.prototype.sign = function (message) {
  var key = this._key;

  var hash = crypto.Hash('sha256').update(message).digest();
  var signature = key.sign(hash);

  var e = BigInteger.fromBuffer(hash);
  var i = bitcoin.ecdsa.calcPubKeyRecoveryParam(ecparams, e, signature,
      key.pub.Q);

  return signature.toCompact(i, key.pub.compressed);
};

_class.prototype.check = function (callback) {
  var self = this;

  function extractPaymentInfo(tx) {
    var tag = null;
    var value = NaN;

    for (var i = 0; i < tx.outputs.length; i++) {
      var out = tx.outputs[i];

      if (!tag && out.type === 'nulldata') {
        tag = out.scriptPubKey.slice(4);
      }

      if (isNaN(value) && out.address === self._address) {
        value = out.value;
      }

      if (tag && !isNaN(value)) {
        break;
      }
    }

    return { tags: tag && [ tag ] || [], value: value | 0 };
  }

  var url = api + 'addresses/' + self._address + '/transactions'
      + '?limit=' + self._limit + '&offset=' + self._offset;

  callApi(url, function (object) {
    if (typeof object !== 'object' || object === null) {
      callback();
      return;
    }

    var transactions = object.data.transactions;

    var payments = transactions.reduce(function (array, tx) {
      var paymentInfo = extractPaymentInfo(tx);

      if (paymentInfo.tags.length > 0) {
        array.push(paymentInfo);
      }

      return array;
    },
    []);

    self._offset = transactions.length < self._limit ? 0
        : self._offset + self._limit;

    callback(payments);
  });
};

module.exports = function (key) {
  return new _class({ key: key });
};

module.exports.verifySignature = function (signature, message, address) {
  var hash = crypto.Hash('sha256').update(message).digest();
  var parsed = bitcoin.ECSignature.parseCompact(signature);

  var e = BigInteger.fromBuffer(hash);
  var Q = bitcoin.ecdsa.recoverPubKey(ecparams, e, parsed.signature, parsed.i);

  var pubKey = new bitcoin.ECPubKey(Q, parsed.compressed);

  return pubKey.getAddress().toString() === address;
};

module.exports.addressFromKey = function (key) {
  return bitcoin.ECKey.fromWIF(key).pub.getAddress().toString();
};

// vim: et ts=2 sw=2
