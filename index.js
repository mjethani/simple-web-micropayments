/* SWM module for Express (Node.js) */

var crypto = require('crypto');

var fs   = require('fs');
var path = require('path');

var express = require('express');

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function isArray(value) {
  return Object.prototype.toString.call(value) === '[object Array]';
}

function hash(message, algorithm) {
  return crypto.Hash(algorithm).update(message).digest();
}

function md5(message) {
  return hash(message, 'md5');
}

function sha256(message) {
  return hash(message, 'sha256');
}

function hex(buffer) {
  return buffer.toString('hex');
}

function base64(buffer) {
  return buffer.toString('base64');
}

function setDateResolution(date, resolution) {
  switch (resolution) {
  case 'hours':
    date.setMinutes(0);
  case 'minutes':
    date.setSeconds(0);
  case 'seconds':
    date.setMilliseconds(0);
  }
}

function fileHash(filename, algorithm, callback) {
  var hash = crypto.Hash(algorithm);

  var stream = fs.createReadStream(filename);

  stream.on('data', function (data) {
    hash.update(data);
  });

  stream.on('error', function (error) {
    callback(error);
  });

  stream.on('end', function () {
    callback(null, hex(hash.digest()));
  });
}

var _class = function (config) {
  if (!config || !config.root || !config.working || !config.published
      || !config.content || !config.content.baseUri) {
    throw new Error('Invalid config');
  }

  var options = isArray(config.payment) ? config.payment
      : isObject(config.payment) ? [ config.payment ] : [];

  options.forEach(function (option) {
    if (!option.network || !option.address
        || option.amount % 1 !== 0 || option.amount < 0) {
      throw new Error('Invalid config');
    }
  });

  this.config = config;
};

_class.prototype.router = function () {
  var self = this;

  if (self._router) {
    return self._router;
  }

  var router = express.Router();

  var cache = {};

  function contentHash(key, callback) {
    var obj = cache[key];

    if (obj && +new Date() <= obj.timestamp + 60000) {
      callback(obj.error, obj.digest);
      return;
    }

    var filename = path.join(self.config.root, key);

    fileHash(filename, 'md5', function (error, digest) {
      cache[key] = { timestamp: +new Date(), error: error, digest: digest };

      callback(error, digest);
    });
  }

  function selectPaymentOption(networks) {
    var paymentOption = null;

    var index = -1;

    if (isArray(self.config.payment)) {
      if (networks) {
        while (!paymentOption && ++index < networks.length) {
          self.config.payment.some(function (option) {
            if (networks[index] === option.network) {
              return paymentOption = option;
            }
          });
        }
      } else {
        paymentOption = self.config.payment[0] || null;
      }
    } else if (isObject(self.config.payment)) {
      if (networks) {
        while (!paymentOption && ++index < networks.length) {
          if (networks[index] === self.config.payment.network) {
            paymentOption = self.config.payment;
            break;
          }
        }
      } else {
        paymentOption = self.config.payment;
      }
    }

    return paymentOption;
  }

  function generateTicket(digest, key, networks) {
    var paymentOption = selectPaymentOption(networks);

    var date = new Date();

    if (self.config.date) {
      setDateResolution(date, self.config.date.resolution);
    }

    var obj = {
      'date': date.toISOString(),
      'content': {
        'digest': digest,
        'digestAlgorithm': 'md5',
        'uri': self.config.content.baseUri + '/' + digest + '/' + key,
      },
      'validity': isNaN(self.config.validity) ? 3600
          : Math.max(0, self.config.validity | 0),
    };

    if (paymentOption) {
      obj['payment'] = {
        'network': paymentOption.network,
        'address': paymentOption.address,
        'amount':  paymentOption.amount,
      };
    }

    return obj;
  }

  function saveTicket(envelope, ticketObject, callback) {
    fs.writeFile(path.join(self.config.working, 'tickets', envelope.id),
        JSON.stringify(envelope), function (error) {
      if (error) {
        callback(error);
      } else {
        if (!self._ticketCache) {
          self._ticketCache = {};
        }
        self._ticketCache[envelope.id] = ticketObject;
        callback();
      }
    });
  }

  function linkContent(key, id, callback) {
    fs.mkdir(path.join(self.config.working, 'content', id), 0755, function () {
      fs.link(path.join(self.config.root, key),
          path.join(self.config.working, 'content', id, key),
          function (error) {
        if (!error || error.code === 'EEXIST') {
          callback();
        } else {
          callback(error);
        }
      });
    });
  }

  function sign(message, network) {
    if (network) {
      var module = self._paymentsModulesByNetwork[network];
      if (module) {
        return module.sign(message);
      }
    }
    return null;
  }

  function prepareTicket(key, networks, callback) {
    contentHash(key, function (error, digest) {
      if (error) {
        callback();
        return;
      }

      var envelope = null;

      var ticketObject = generateTicket(digest, key, networks);

      var ticket = JSON.stringify(ticketObject);

      if (!self._envelopeCache) {
        self._envelopeCache = {};
      } else if (envelope = self._envelopeCache[ticket]) {
        callback(null, envelope, ticketObject);
        return;
      }

      var signature = sign(ticket,
          ticketObject.payment && ticketObject.payment.network);

      var object = new Buffer(ticket);

      envelope = {
        object: base64(object)
      };

      if (signature) {
        envelope.signature = base64(signature);
      }

      envelope.id = hex(sha256(Buffer.concat([ object,
                signature || new Buffer(0) ])));
      envelope.ttl = isNaN(self.config.ttl) ? 10
          : Math.max(1, self.config.ttl | 0);

      linkContent(key, envelope.id, function (error) {
        if (error) {
          callback(error);
        } else {
          saveTicket(envelope, ticketObject, function (error) {
            if (error) {
              callback(error);
            } else {
              self._envelopeCache[ticket] = envelope;

              callback(null, envelope, ticketObject);
            }
          });
        }
      });
    });
  }

  function renderView(res, envelope, ticketObject) {
    if (self.config.view) {
      var object = {
        envelope: {
          object: ticketObject,
          id: envelope.id
        }
      };

      res.render(self.config.view, object, function (err, html) {
        if (err) {
          res.end();
        } else {
          res.send(html);
        }
      });
    } else {
      res.end();
    }
  }

  router.use('/:key', function (req, res, next) {
    var networks = req.get('X-SWM-Accept-Network');

    if (networks) {
      networks = networks.split(',').map(function (x) {
        return x.replace(/^ *| *$/g, '');
      });
    }

    prepareTicket(req.params.key, networks,
        function (error, envelope, ticketObject) {
      if (!envelope) {
        next(error);
        return;
      }

      res.status(402);

      res.set('X-SWM', '0.1');

      res.set('X-SWM-Object', envelope.object);

      if (envelope.signature) {
        res.set('X-SWM-Signature', envelope.signature);
      }

      res.set('X-SWM-ID', envelope.id);
      res.set('X-SWM-TTL', envelope.ttl);

      renderView(res, envelope, ticketObject);
    });
  });

  self._router = router;

  return router;
};

_class.prototype.initialize = function (paymentsModules) {
  var self = this;

  self._paymentsModules = paymentsModules || [];

  self._paymentsModulesByNetwork = {};
  self._paymentsModules.forEach(function (module) {
    self._paymentsModulesByNetwork[module.network()] = module;
  });

  var dirs = [
    self.config.working,
    path.join(self.config.working, 'content'),
    path.join(self.config.working, 'tickets'),
    self.config.published,
  ];

  dirs.forEach(function (d) {
    try {
      fs.mkdirSync(d, 0755);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  });
};

_class.prototype.run = function () {
  var self = this;

  function ticket(id) {
    if (!self._ticketCache) {
      self._ticketCache = {};
    }

    if (self._ticketCache.hasOwnProperty(id)) {
      return self._ticketCache[id];
    }

    var data = null;

    try {
      data = fs.readFileSync(path.join(self.config.working, 'tickets', id));
    } catch (error) {
      return self._ticketCache[id] = null;
    }

    var envelope = null;

    try {
      envelope = JSON.parse(data);
    } catch (error) {
      return null;
    }

    var object = new Buffer(envelope.object, 'base64');

    var ticketObject = null;

    try {
      ticketObject = JSON.parse(object);
    } catch (error) {
      return null;
    }

    self._ticketCache[id] = ticketObject;

    return ticketObject;
  }

  function publish(id, callback) {
    if (!callback) {
      callback = function () {};
    }

    var ticketObject = ticket(id);

    fs.rename(path.join(self.config.working, 'content', id),
          path.join(self.config.published, ticketObject.content.digest),
          function (error) {
      if (error && error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') {
        callback(error);
      } else {
        if (self._ticketCache) {
          self._ticketCache[id] = null;
        }

        var filename = path.join(self.config.working, 'tickets', id);

        fs.rename(filename, filename + '.done', callback);
      }
    });
  }

  function paymentValid(paymentInfo) {
    if (paymentInfo.tags.length === 0) {
      return false;
    }

    var ticketObject = ticket(paymentInfo.tags[0]);

    if (!ticketObject) {
      return false;
    }

    if (paymentInfo.value < ticketObject.payment.amount) {
      return false;
    }

    return true;
  }

  function handlePayment(paymentInfo) {
    if (paymentValid(paymentInfo)) {
      publish(paymentInfo.tags[0]);
    }
  }

  function ticketExpired(id) {
    var ticketObject = ticket(id);
    return ticketObject && +new Date(ticketObject.date)
          + ticketObject.validity * 1000 < +new Date();
  }

  function deleteExpiredTicket(id) {
    fs.rename(path.join(self.config.working, 'tickets', id),
        path.join(self.config.working, 'tickets', id + '.expired'),
        function () {});
    fs.rename(path.join(self.config.working, 'content', id),
        path.join(self.config.working, 'content', id + '.expired'),
        function () {});
  }

  function clean() {
    fs.readdir(path.join(self.config.working, 'tickets'),
        function (error, files) {
      if (files) {
        files.filter(function (x) {
          return x.indexOf('.') === -1;
        }).forEach(function (id) {
          if (ticketExpired(id)) {
            deleteExpiredTicket(id);
          }
        });
      }
    });
  }

  function check() {
    var count = 0;

    self._paymentsModules.forEach(function (module) {
      module.check(function (payments) {
        if (payments) {
          payments.forEach(function (paymentInfo) {
            handlePayment(paymentInfo);
          });
        }

        if (++count === self._paymentsModules.length) {
          setTimeout(check, 1000 * Math.max(60, self.config.ttl | 0));
        }
      });
    });

    clean();
  }

  self._paymentsModules.forEach(function (module) {
    module.on('payment', function (paymentInfo) {
      handlePayment(paymentInfo);
    });
  });

  check();
};

module.exports = function (config) {
  return new _class(config);
};

module.exports.Bitcoin = require('./modules/bitcoin');
module.exports.Ripple  = require('./modules/ripple');

// vim: et ts=2 sw=2
