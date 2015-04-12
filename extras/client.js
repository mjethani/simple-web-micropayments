/* Sample client for testing */

var crypto = require('crypto');

var http  = require('http');
var https = require('https');
var url_  = require('url');

var ripple = require('ripple-lib');

var swim = require('../');

var key = '';

function trace() {
  var prefix = '[' + process.uptime().toFixed(2) + ']';
  var args = [ prefix ].concat(Array.prototype.slice.call(arguments));

  console.error.apply(console, args);
}

function addressFromKey(key) {
  return ripple.Seed.from_json(key).get_key().get_address().to_json();
}

function makePayment(obj, callback) {
  var object = new Buffer(obj.object, 'base64');
  var signature = new Buffer(obj.signature, 'base64');

  var ticketObject = JSON.parse(object.toString());

  if (!ticketObject.payment || ticketObject.payment.network !== 'Ripple') {
    callback(new Error('Network not supported.'));
    return;
  }

  var paymentAddress = ticketObject.payment.address;

  if (!swim.Ripple.verifySignature(signature, object, paymentAddress)) {
    callback(new Error('Signature does not verify!'));
  }

  trace('Making payment to ' + paymentAddress + ' ...');

  var address = addressFromKey(key);
  var remote = new ripple.Remote({
    servers: [ 'wss://s1.ripple.com:443' ]
  });

  remote.connect(function () {
    remote.setSecret(address, key);

    var transaction = remote.createTransaction('Payment', {
      account: address,
      destination: paymentAddress,
      amount: ripple.Amount.from_json(String(ticketObject.payment.amount))
    });

    transaction.setInvoiceID(obj.id);

    trace('Transaction: Pay ' + (ticketObject.payment.amount / 1000000)
        + ' XRP for invoice ID ' + obj.id);

    transaction.submit(function (error, response) {
      try {
        remote.disconnect();
      } catch (error) {
      }
      if (error) {
        callback(error);
      } else {
        trace('Engine result ' + response.engine_result);

        callback(null, ticketObject.content.uri);
      }
    });
  });

  remote.on('error', function (error) {
    try {
      remote.disconnect();
    } catch (error) {
    }
    callback(error);
  });
}

function verifyContentHash(data, contentObject) {
  var algorithm = contentObject.digestAlgorithm;
  var digest = crypto.Hash(algorithm).update(data).digest().toString('hex');

  return digest === contentObject.digest;
}

function getTicket(headers) {
  var obj = {
    object: headers['x-swm-object'],
    ttl: headers['x-swm-ttl'],
  };

  if (headers['x-swm-signature']) {
    obj.signature = headers['x-swm-signature'];
  }

  obj.id = crypto.Hash('sha256')
      .update(new Buffer(obj.object, 'base64'))
      .update(obj.signature ? new Buffer(obj.signature, 'base64') : '')
      .digest().toString('hex');

  obj.ttl = +obj.ttl;

  if (isNaN(obj.ttl) || obj.ttl <= 0) {
    obj.ttl = 10;
  }

  return obj;
}

function readResponse(response, callback) {
  var data = '';
  response.on('data', function (chunk) {
    data += chunk;
  });
  response.on('end', function () {
    callback(data);
  });
}

function retryUrl(url, ttl, callback) {
  setTimeout(function () {
    fetchUrl(url, function (error, data) {
      if (error) {
        callback(error);
      } else if (data != null) {
        callback(null, data);
      } else {
        trace('Not found');
        trace('Will retry in ' + ttl + ' seconds');

        retryUrl(url, ttl, callback);
      }
    });
  }, ttl * 1000);
}

function fetchUrl(url, callback) {
  trace('Fetching ' + url + ' ...');

  var options = url_.parse(url);

  options.headers = {
    'X-SWM-Accept-Network': 'Ripple'
  };

  var http_ = url.slice(0, 8) === 'https://' ? https : http;

  var request = http_.request(options, function (response) {
    if (response.statusCode === 200) {
      readResponse(response, function (data) {
        callback(null, data);
      });
    } else if (response.statusCode === 402) {
      trace('402 Payment Required');

      if (response.headers['x-swm']) {
        handleTicket(getTicket(response.headers), callback);

      } else {
        readResponse(response, function (data) {
          callback(null, data);
        });
      }
    } else {
      callback();
    }
  });

  request.on('error', function (error) {
    callback(error);
  });

  request.end();
}

function fetchPaidContent(ticketObject, ttl, callback) {
  trace('Ready to try ' + ticketObject.content.uri
      + ' after ' + ttl + ' seconds');

  retryUrl(ticketObject.content.uri, ttl, function (error, data) {
    if (error) {
      callback(error);
    } else {
      if (!verifyContentHash(data, ticketObject.content)) {
        console.error('WARNING: Digest does not verify.');
      }

      callback(null, data);
    }
  });
}

function handleTicket(obj, callback) {
  var ticketObject = JSON.parse(new Buffer(obj.object, 'base64').toString());

  fetchUrl(ticketObject.content.uri, function (error, data) {
    if (error) {
      callback(error);
    } else if (data != null && verifyContentHash(data, ticketObject.content)) {
      trace('Content is available');

      callback(null, data);
    } else {
      makePayment(obj, function (error) {
        if (error) {
          callback(error);
        } else {
          fetchPaidContent(ticketObject, obj.ttl, callback);
        }
      });
    }
  });
}

function run() {
  if (!key) {
    console.error('key is empty');
    process.exit(1);
  }

  if (process.argv.length < 3) {
    console.error('usage: node client.js <url>');
    process.exit(1);
  }

  var url = process.argv[2];

  fetchUrl(url, function (error, data) {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    if (data) {
      console.log(data);
    }
  });
}

function main() {
  run();
}

if (require.main === module) {
  main();
}

// vim: et ts=2 sw=2
