/* Ripple module */

var crypto = require('crypto');
var events = require('events');
var util   = require('util');

var ripple = require('ripple-lib');

var WebSocket = require('ws');

var sjcl = ripple.sjcl;

var ws = null;

var _class = function (config) {
  this.config = config;

  var k = ripple.Seed.from_json(config.key).get_key();

  this._key = k._secret;
  this._address = k.get_address().to_json();
};

util.inherits(_class, events.EventEmitter);

_class.prototype.network = function () {
  return 'Ripple';
};

_class.prototype.sign = function (message) {
  var key = this._key;

  var hex = crypto.Hash('sha256').update(message).digest().toString('hex');
  var bits = sjcl.codec.hex.toBits(hex);

  var sig = key.signWithRecoverablePublicKey(bits);

  return new Buffer(sjcl.codec.bytes.fromBits(sig));
};

_class.prototype.check = function (callback) {
  var self = this;

  function extractPaymentInfo(tx) {
    var info = { tags: [], value: 0 };

    if (typeof tx.InvoiceID === 'string' && tx.TransactionType === 'Payment') {
      info.tags.push(tx.InvoiceID.toLowerCase());

      if (tx.Destination === self._address && typeof tx.Amount === 'string') {
        info.value = tx.Amount | 0;
      }
    }

    return info;
  }

  if (!ws) {
    ws = new WebSocket('wss://s1.ripple.com:443');

    ws.on('error', function (error) {
      ws = null;
    });

    if (ws) {
      ws.on('open', function () {
        var options = {
          command: 'subscribe',
          accounts: [ self._address ]
        };

        ws.send(JSON.stringify(options), function (error) {
          if (error) {
            ws = null;
          }
        });
      });
    }

    if (ws) {
      ws.on('message', function (data) {
        var obj = JSON.parse(data);

        if (obj.type === 'transaction') {
          var paymentInfo = extractPaymentInfo(obj.transaction);

          if (paymentInfo.tags.length > 0) {
            self.emit('payment', paymentInfo);
          }
        }
      });
    }
  }

  callback();
};

module.exports = function (key) {
  return new _class({ key: key });
};

module.exports.verifySignature = function (signature, message, address) {
  var hex = crypto.Hash('sha256').update(message).digest().toString('hex');
  var bits = sjcl.codec.hex.toBits(hex);

  var sig = sjcl.codec.hex.toBits(signature.toString('hex'));

  var pubKey = null;

  try {
    pubKey = sjcl.ecc.ecdsa.publicKey.recoverFromSignature(bits, sig);
  } catch (error) {
  }

  if (pubKey) {
    var k = ripple.Seed.from_json(Array(32 + 1).join('0')).get_key();
    k._pubkey = pubKey;
    return k.get_address().to_json() === address;
  } else {
    return false;
  }
};

module.exports.addressFromKey = function (key) {
  return ripple.Seed.from_json(key).get_key().get_address().to_json();
};

// vim: et ts=2 sw=2
