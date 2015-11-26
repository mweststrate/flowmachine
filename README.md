# Flow Machine

**State machine inspired (asynchronous) control flow library**

[![Build Status](https://travis-ci.org/mweststrate/flowmachine.svg?branch=master)](https://travis-ci.org/mweststrate/flowmachine)
[![Coverage Status](https://coveralls.io/repos/mweststrate/flowmachine/badge.svg?branch=master&service=github)](https://coveralls.io/github/mweststrate/flowmachine?branch=master)
[![Join the chat at https://gitter.im/mweststrate/flowmachine](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/mweststrate/flowmachine?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Installation

`npm install flowmachine --save`

## Introduction

Flow machine solves the callback hell by separating asynchronous statements from the control flow it self.
In a Flow machine you just provide a flat list of (asynchronous) functions (called flows) that need to be executed.

The conceptual syntax of a flow machine is:

```javascript

// machine & gate declarations
flowmachine((gate1, gate2, gate3) => [
	
	// flow declaration:
	// a list of gates that needs fullfilment followed by an action
	[ gate1, gate3, ... , () => {
		// action that updates some other gates	
	}], 
	
	// .. more flow declarations
	[ ... ]
	
// callback to call back to the outer world when the machine finishes
], callback);
```

So the simplest possible example of a flow machine is:

```javascript
import flowmachine from 'flowmachine';

function answerMyQuestion(callback) {
	flowmachine((answer) => [

		[	() => answer.set(42)	]

	], callback);
}

answerMyQuestion((err, answer) => {
	// Prints 42
	console.log(answer);
});

```

This might looks a bit cumbersome, but don't worry.
It will be fun when we start extending it.
First let's first define what flow machine is:

* `flowmachine`: Function to create and start a flowmachine. Accepts a **flow machine definition** and a **callback**.
* **callback**: A node style callback function that is called only once. Either with the **error** that failed the machine or the value of the **_last_ gate**. 
* **flow machine definition**: A function. Each of its arguments declares a **gate**. It should return a list of **flows**.
* **gate**: A promise / deffered / future like structure which acts as access gate to a **flow** and which can also hold a **value**.
The last gate declared has a special meaning: When it is fullfilled it finished the flow machine.
* **flow**: A flow statement is an array consisting of zero or more **predicates** (usually gates) and a single **action**.
Each **flow** is executed only once.
* **action**: An argumentless function that is inovked when all predicates in the flow succeed. Its goal is to transition the flow machine to its next state by fullfilling one or more gates.
* **predicate**: Condition that needs to be met before a **flow** is executed. Usually just a reference to a **get**, but can also be a literal **boolean** value or a function that returns a boolean.

The order of flow statements in a flow machine is not important. The flow machine will automatically kick of any flow automatically for which all predicates are fullfilled.
This makes a flow machine really declarative, you don't have to wire up the control flow yourself.
Flows that can be run in parallel will automatically be run in parallel.
A flow that depends on a gate that will be resolved by another flow will be chained automatically.
Since all gates are in the closure of all flows, no callback pyramid is required!

### Example:

Let's take a look at a more real world example:

```javascript

function writeDirectoryHashes(dir, callback) {
	flowmachine((files, md5hashes, filesCount, done) => [
		
		// glob all the files, fullfills (or fails) the files gate
		[ () => glob("**/*", files.resolve) ],
		
		// if gate files is fullfilled, get md5 hashes
		[ files, () => {
			files.map((file, cb) => md5sum(file, cb), md5hashes.resolve);
		}],
		
		// in parallel, we can do something else with the files
		[ files, () => {
			console.log("Found %d file(s)..", files.length);
		}],

		// write the hashes if the files and hashes are available
		[ files, md5hashes, () => {
			fs.writeFile('hashes.txt', lodash.zip(files(), md5hashes()).join('\n'), 'utf8', done.resolve);
		}]

	], callback);
}
```

This flow machine will run until `done` is called, which doesn't happen before the `md5hashes` and `files` are available.
If one the flows throwns an error or invokes a callback with an error, the flow machine will abort and immediately call the `callback` with the error. 

## Api

### Gates

Each gate is function and object which exposes the following api.
All methods of a gate are automatically bound and can be safely passed around without binding.

* `get()` Returns the current value of the gate. Throws if not resolved yet.
* `gateAbc()` Just a shorthand for `gateAbc.get()`
* `set(value?)` Resolves the gate with the provided value. Any flow that was pending on this gate will be triggered.
* `fail(err)` Fails the gate with the given error. This will immediately fail the complete flow machine.
* `isResolved()` Returns true if the gate has been fullfilled.
To prevent that, pass a custom callback instead of this predefined one to your callback requiring function.
* `resolve(err, value)` Resolve function that can be passed around as node style callback. Will either `set` or `fail` the gate.
* `name()` Returns the name of the gate. Might be affected by uglifiers.

### Gate utilities

* `map` TODO
* `each` TODO (also pass prev value into each callback!)


### Adding more methods to gates

Gates are an extendible concept on which you might want to add more flow patterns.
You can just introduce or override methods on gates by altering its prototype:

```javascript
import {gatePrototype} from "flowmachine"

var baseSet = gatePrototype.set;
gatePrototype.set = function(value) {
	console.log("Updating gate '%s' with value '%s'", this.name(), value);
	return baseSet.call(this, value);
};
```

### `flowmachine` api

A new flow machine can be created by using `flowmachine(definition, callback)`. See the above introduction.
For debugging purposes, use `flowmachine.debug(definition, callback)`.
It will log all state transitions for this flow machine to the console.

`flowmachine` returns a FlowMachine object, that can be used to inspect externally the state of the flowmachine.
This might be useful for debugging or testing.
Note that a flow machine with only synchronous actions will run to completion immediately upon creation.
In general; there shouldn't be a need to use any of these methods!

* `isAborted()`
* `isRunning()`
* `isCompleted()`
* `fail(err)` Fails a running flowmachine with the given error.
* `continue()` Trigger the flowmachine to check again whether there is a flow that can be kicked of. 
* `getGate(nr | name)` Returns the gate object with at the given index or with the given name. Note that names cannot be trusted if the source is uglified.


## Why Flow Machine?

Flow Machine is a fresh approach to solving the callback hell.
Inspired by promises and asynquence it solves a few problems from promised based control flow:
1. Flow machine makes it easy to write complex control flows with conditional parts
2. Passing multiple values to a next promise is always cumbersome. With flow machines, there is no need to pass stuff around; all values are in scope of all flows. 
3. A flow machine runs statements synchronously whenever possible. This simplifies debugging.
4. Flow machine contracts are less fragile, there are less implicit rules like &ldquo;either return a promise or call `done`&rdquo;.
4. Flow machines don't require any &ldquo;promisify&rdquo; magic to work with existing apis.
5. Flow machines are strongly typed.

## Using with Typescript

Flow machine ships with its own typings in the package, so no tsd definitions are required.
It is recommended to specify the type of your gates so that your complete flow machine will be strongly typed!
In the following example all variable types will be inferred:

```javascript
import flowmachine, {Gate, ArrayGate} from './index'; 

function getDirSize(dir: string, callback(err, amount: number) {
	flowmachine<number>((fileList: ArrayGate<string>, done:Gate<number>) => [
		
		[ () => fs.readDir(dir, fileList.resolve) ],
		
		[ fileList, () => {
			fileList.map(fs.stat, (err, sizes) => {
				if (err)
					done.fail(err);
				else
					done.set(sizes.reduce((a, b) => a + b, 0));
			}); 
		} ] 

	], callback);
});
```

The `ArrayGate` is a special flavour of gate that exposes additional methods for working with arrays.
The backing implementation is the same as a normal `Gate`.

## Future work

* add support for ES6 generators / iterators
