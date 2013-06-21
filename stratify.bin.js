#!/usr/bin/env node

/*

  ___ usage: en_US ___
  stratify [options]

  options:

  -d, --directory         [name]  Name of directory to store database.

  ___ usage ___

 */

var Strata = require('./index'), processing = false, queue = [ { type: 'create' } ];

var cadence = require('cadence'), ok = require('assert');


require('arguable').parse(__filename, process.argv.slice(2), function (options) {
  var strata = new Strata(options.params.directory, { branchSize: 3, leafSize: 3 });

  var actions = {};

  actions.create = function (action, callback) {
    strata.create(callback);
  }

  var alphabet = 'abcdefghiklmnopqrstuvwxyz'.split('');

  function inc (string) {
    var parts = string.split('').reverse(), i = 0;
    for (;;) {
      var letter = i < parts.length ? alphabet.indexOf(parts[i]) + 1 : 0;
      if (letter == alphabet.length) letter = 0;
      parts[i] = alphabet[letter];
      if (letter || ++i == parts.length) break;
    }
    if (!letter) {
      parts.push('a');
    }
    return parts.reverse().join('');
  }

  actions.add = cadence(function (step, action) {
    step(function () {
      strata.mutator(action.values[0], step());
    }, function (cursor) {
      var next;
      step(next = function () {
        cursor.indexOf(action.values[0], step());
      }, function (index) {
        ok(index < 0);
        cursor.insert(action.values[0], action.values[0], ~ index, step());
        action.values.shift();
        if (action.values.length) step.jump(next);
      }, function () {
        cursor.unlock();
      });
    });
  });

  actions.balance = function (action, callback) {
    strata.balance(callback);
  }

  function print (tree, address, index, depth) {
    tree.forEach(function (child, index) {
      var padding = new Array(depth + 1).join('   ');
      if (child.address < 0) {
        console.log(padding + (index ? child.children[0] : '<'));
          process.stdout.write('   ' + padding + child.children.join(', ') +  '\n');
      /*  child.children.forEach(function (value) {
          process.stdout.write('   ' + padding + value +  '\n');
        });*/
      } else {
        if (!('key' in child)) {
          process.stdout.write(padding + '<\n');
        } else {
          process.stdout.write(padding + child.key + '\n');
        }
        print(child.children, child.address, 0, depth + 1);
      }
    });
  }

  actions.vivify = cadence(function (step, action) {
    step(function () {
      strata.vivify(step());
    }, function (tree) {
      print(tree, 0, 0, 0);
    });
  });

  actions.stringify = cadence(function (step) {
    console.log('stringify');
  });

  function consume (callback) {
    if (queue.length) {
      processing = true;
      var action = queue.shift();
      actions[action.type](action, function (error) {
        if (error) callback(error);
        else process.nextTick(function () {
          consume(callback);
        });
      });
    } else {
      processing = false;
      callback();
    }
  }

  var buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('readable', function () {
    var data;
    while ((data = process.stdin.read()) != null) {
      var lines = (buffer + data).split(/\n/);
      buffer = lines.pop();
      lines.forEach(function (line) {
        switch (line[0]) {
        case '+':
          var $ = /^\+([a-z]+)(?:-([a-z]+))?\s*$/.exec(line), values = [];
          values.push($[1]);
          $[2] = $[2] || $[1];
          while ($[1] != $[2]) {
            $[1] = inc($[1]);
            values.push($[1]);
          }
          queue.push({ type: 'add', values: values });
          break;
        case '>':
          queue.push({ type: 'stringify' });
          break;
        case '~':
          queue.push({ type: 'balance' });
          break;
        case '!':
          queue.push({ type: 'vivify' });
          break;
        }
      });
      if (!processing) consume(function (error) { if (error) throw error });
    }
  });

});