#!/bin/bash

# usage: ./start.sh

export CONFIG_FILE=./my-config.json
export PORT=10000
DEBUG=swm ./bin/www 2>&1 \
  | awk '{gsub(/\x1b\[[0-9]+m/,"");print;fflush();}' > www.log &
echo `jobs -p` > .pid

