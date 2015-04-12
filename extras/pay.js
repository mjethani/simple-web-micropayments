/* Bitcoin payment script for testing */

var https  = require('https');
var url_   = require('url');

var bitcoin = require('bitcoinjs-lib');

var api = 'https://mainnet.helloblock.io/v1/';

var key = '';

var fee = 10000;

function addressFromKey(key) {
  return bitcoin.ECKey.fromWIF(key).pub.getAddress().toString();
}

function callApi(url, data, callback) {
  if (typeof data === 'function') {
    callback = data;
    data = null;
  }

  var options = url_.parse(url);

  if (data) {
    options.method = 'POST';

    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }

    options.headers = {
      'Content-Type': 'application/json',
      'Content-Length': new Buffer(data).length
    };
  }

  var request = https.request(options, function (response) {
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
  });

  request.on('error', function (error) {
    callback();
  });

  if (data) {
    request.write(data);
  }

  request.end();
}

function run() {
  if (process.argv.length < 4) {
    console.error('usage: node pay.js <recipient> <amount> [<tag>]');
    process.exit(1);
  }

  var recipient = process.argv[2];
  var amount = process.argv[3];
  var tag = process.argv[4];

  if (isNaN(amount)) {
    console.error('amount must be a number');
    process.exit(1);
  }

  if (+amount !== Math.abs(Math.round(amount))) {
    console.error('amount must be a whole number');
    process.exit(1);
  }

  var address = addressFromKey(key);

  var url = api + 'addresses/' + address + '/unspents';

  callApi(url, function (object) {
    if (typeof object !== 'object' || object === null) {
      console.error('API unavailable');
      process.exit(1);
    }

    var unspents = object.data.unspents.filter(function (x) {
      return x.type === 'pubkeyhash';
    });

    if (unspents.length === 0) {
      console.error('No unspent outputs');
      process.exit(1);
    }

    var balance = unspents.reduce(function (a, x) {
      return a + x.value;
    },
    0);

    if (balance < +amount + fee) {
      console.error('Insufficient balance');
      process.exit(1);
    }

    var builder = new bitcoin.TransactionBuilder();

    unspents.forEach(function (x) {
      builder.addInput(x.txHash, x.index);
    });

    builder.addOutput(recipient, +amount);
    builder.addOutput(address, balance - +amount - fee);

    if (tag) {
      var data = new Buffer(tag, 'hex');
      var dataScript = bitcoin.scripts.nullDataOutput(data);

      builder.addOutput(dataScript, 0);
    }

    for (var index = 0; index < unspents.length; index++) {
      builder.sign(index, bitcoin.ECKey.fromWIF(key));
    }

    var tx = builder.build();
    var txHex = tx.toHex();

    var postObject = { 'rawTxHex': txHex };

    callApi(api + 'transactions', postObject, function (object) {
      if (typeof object !== 'object' || object === null) {
        console.error('API unavailable');
        process.exit(1);
      }

      if (object.status !== 'success') {
        console.error('Transaction failed');
        process.exit(1);
      }

      console.log(object.data.transaction.txHash);
    });
  });
}

function main() {
  run();
}

if (require.main === module) {
  main();
}

// vim: et ts=2 sw=2
