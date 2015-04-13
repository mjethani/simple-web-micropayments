This is a reference implementation of the Simple Web Micropayments (SWM) scheme as briefly described here:

[https://blog.manishjethani.com/simple-web-micropayments](https://blog.manishjethani.com/simple-web-micropayments)

### git clone

You can start by cloning the repository:

```console
$ git clone https://github.com/mjethani/swim.git
Cloning into 'swim'...
remote: Counting objects: 63, done.
remote: Compressing objects: 100% (43/43), done.
remote: Total 63 (delta 23), reused 50 (delta 13), pack-reused 0
Unpacking objects: 100% (63/63), done.
Checking connectivity... done
$ cd swim
$ 
```

Install [Node.js](https://nodejs.org/).

### Configuration

Edit the config.json file:

```javascript
{
  "payment": [
    {
      "network": "Bitcoin",
      "key": "<key>",
      "price": 100000
    }
  ]
}
```

Change `<key>` to your Bitcoin private key. e.g. `5K7WRapB9oai1UZuQaSokQhT5hKs5dkB1yZoVtLUjBkeUjWmEmm`

Install any dependencies:

```console
$ npm install
```

### Demo

Start the server:

```console
$ DEBUG=swim:server npm start

> swim@0.0.0 start /Users/bob/swim
> node ./bin/www

  swim:server Listening on port 40200 +0ms

```

Then load [http://localhost:40200/hello-world.txt](http://localhost:40200/hello-world.txt) in your browser. You should get a "402 Payment Required" message.

#### Make a payment

You can make a Bitcoin payment using the pay.js script.

```console
$ node extras/pay.js
usage: node pay.js <recipient> <amount> [<tag>]
$ 
```

First edit the pay.js file and set the key to your Bitcoin private key.

e.g.

```javascript
var key = '5HqoUvVvQjVeH9ZgDgRrw1K9z8voqsUT7ifAYRicBTRfa9nRhmM';
```

__Pro tip:__ It's best to [create a new address][4] for this.

[4]:https://www.bitaddress.org/bitaddress.org-v2.9.8-SHA256-2c5d16dbcde600147162172090d940fd9646981b7d751d9bddfc5ef383f89308.html

When you run the script, set `<tag>` to the ID given on the 402 page; set `<amount>` to the amount in satoshis (e.g. `100000` for 0.001 BTC). If the payment succeeds, the script will print out the transaction hash.

e.g.

```console
$ node extras/pay.js 1NZc7XcToQ7fnokgYf4iAJmRfUnfa7gqpz 100000 1a8211babd8d37ac6f9af04f44ac65d625084a3e348a7a8114726fa43989d3db
b7fe2f8a2f00a1a66a5f8f9dce2812569925efea436f170a126faf7654a94b5d
$ 
```

After about a minute, try to access [http://localhost:40200/snapshot/746308829575e17c3331bbcb00c0898b/hello-world.txt](http://localhost:40200/snapshot/746308829575e17c3331bbcb00c0898b/hello-world.txt) in your browser. It should return a text document saying "Hello, world!" This means your payment was accepted.

### Express plug-in

You can plug this into your own [Express][3] app.

```javascript
var path = require('path');

var express = require('express');

var swim = require('/path/to/swim/');

...

// Module configuration
var config = {
  // Where your 402-protected content resides
  root: path.join(__dirname, 'content'),

  // Where the SWM module keeps its files
  working:   path.join(__dirname, '.data'),
  // Where to publish the content once a payment has been received
  published: path.join(__dirname, 'public', 'snapshot'),

  'content': {
    baseUri: 'http://example.com/snapshot',
  },

  // Payment options
  'payment': [
    {
      'network': 'Bitcoin',
      'address': '1NZc7XcToQ7fnokgYf4iAJmRfUnfa7gqpz',
      'amount':  100000
    },
  ],
};

// Payments modules
var modules = [
  swim.Bitcoin('5K7WRapB9oai1UZuQaSokQhT5hKs5dkB1yZoVtLUjBkeUjWmEmm'),
];

var instance = swim(config);

instance.initialize(modules);
instance.run();

...

var app = express();

...

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', instance.router());

...
```

Refer to the app.js file for a working example.

[3]:http://expressjs.com/

### Bitcoin, Ripple, and third-party modules

Modules for Bitcoin and Ripple are already included in the package.

You can write your own modules (e.g. Dogecoin) by implementing the following interface:

```javascript
var events = require('events');
var util   = require('util');

var _class = function (config) {
  this.config = config;
};

util.inherits(_class, events.EventEmitter);

_class.prototype.network = function () {
  // Return the name of the network, e.g. Dogecoin
};

_class.prototype.sign = function (message) {
  // Sign the message and return the signature

  // Note: It must be possible to verify the signature using the
  // payment address. Please see the bitcoin.js and ripple.js files
  // for how to implement this.
};

_class.prototype.check = function (callback) {
  // Check the network for incoming payments

  // The callback takes an array of objects of the format
  // "{ tags: [], value: 0 }", where tags is one or more "tags" found in
  // the transaction (e.g. OP_RETURN value in Bitcoin), and value is the
  // total amount received.

  // Additionally, here your module can start listening for payments
  // in the background (via WebSocket, for example) and emit a 'payment'
  // event every time it receives a new one.
};

module.exports = function (key) {
  return new _class({ key: key });
};
```

### Bugs

If you run into any bugs, please report them on the project's [Issues page](https://github.com/mjethani/swim/issues).

---

Copyright (c) 2015 Manish Jethani
