#!/bin/bash

# usage: ./stop.sh

cd `dirname $0`/.. || exit 1

kill $(cat .pid)

