This is a reference implementation of the Simple Web Micropayments (SWM) scheme.

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
  ],
  "baseUrl": "http://example.com"
}
```

Change `<key>` to your Bitcoin private key in [Wallet Import Format][1]. e.g. `5K7WRapB9oai1UZuQaSokQhT5hKs5dkB1yZoVtLUjBkeUjWmEmm`

The price is set to 100,000 [satoshis][2] by default. You can change it to the amount you wish to charge for your content.

Set `baseUrl` to the root of your website.

[1]:https://en.bitcoin.it/wiki/Wallet_import_format
[2]:https://en.bitcoin.it/wiki/Satoshi_(unit)

Run the init script:

```console
$ . ./init
mkdir: created directory '.data'
mkdir: created directory '.data/content'
mkdir: created directory '.data/tickets'
mkdir: public: File exists
mkdir: created directory 'public/snapshot'
$ 
```

Run `npm install` to install any dependencies.

Now you're ready.

### Demo

Start the server:

```console
$ npm start

> swim@0.0.0 start /Users/bob/swim
> node ./bin/www

```

Then load [http://localhost:3000/hello-world.txt](http://localhost:3000/hello-world.txt) in your browser. You should get a "402 Payment Required" message.

You can make a Bitcoin payment using the pay.js script.

```console
$ node pay.js
usage: node pay.js <recipient> <amount> [<tag>]
$ 
```

First edit the pay.js file and set the key to your Bitcoin private key:

```javascript
var key = '5K7WRapB9oai1UZuQaSokQhT5hKs5dkB1yZoVtLUjBkeUjWmEmm';
```

When you run the script, set `<tag>` to the ID given on the 402 page; set `<amount>` to the amount in satoshis (e.g. `100000` for 0.001 BTC). If the payment succeeds, the script will print out the transaction hash.

After about a minute, try to access [http://localhost:3000/snapshot/746308829575e17c3331bbcb00c0898b/hello-world.txt](http://localhost:3000/snapshot/746308829575e17c3331bbcb00c0898b/hello-world.txt) in your browser. It should return a text document saying "Hello, world!" This means your payment was accepted.

### Module

You can plug this into your own [Express][3] app.

```javascript
var express = require('express');

var swim = require('/path/to/swim/');

var swimConfig = {
  ...
};

var modules = [
  ...
];

var swimInstance = swim(swimConfig);

swimInstance.initialize(modules);
swimInstance.run();

var app = express();

...

app.use(swimInstance.router());
```

Refer to the app.js file for a working example.

[3]:http://expressjs.com/
