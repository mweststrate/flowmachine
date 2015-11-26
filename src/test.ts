/// <reference path="../typings/tsd.d.ts" />

var test = require('tape');
import fm, {Gate} from './index';

test('trivial machine', t => {
	fm((done:Gate<boolean>) => [
		[() => {
			done.set(true)
		}]
	], (err, value) => {
		t.equal(value, true);
		t.end();
	});
});

test('error machine', t => {
	fm(done => [
		[() => done.fail(true)]
	], (err, value) => {
		t.equal(err, true);
		t.end();
	});
});

test('errors 1', t => {
	var cb = function(err, b) {}
	var lambda = () => {};

	var m = <any> fm;
	var tt = t.throws;

	tt(() => m(lambda), "definition should accept at least one argument");
	tt(() => m(a => ({})), "definition should return array");
	tt(() => m(a => [{}]), "statement should be an array");
	tt(() => m(a => [lambda, lambda]), "should be at least one statement without predicates");
	tt(() => m(a => [lambda]), "Expected callback as second argument");
	tt(() => m(a => [], cb), "Statement should be an array");
	tt(() => m(a => [{}], cb), "statement should be an array");
	tt(() => m(a => [(a) => true, lambda], cb), "function without arguments");
	tt(() => m(a => [lambda, (a) => true], cb), "should end with lambda expression");

	t.end();
});

test('m2', t => {
	fm.debug((a:Gate<number>, b, done) => [
		[() => {
			debugger;
			a.resolve(null, 2)
		}],
		// these 3 are never triggered:
		[b, () => { t.equal(false, true) }],
		// never triggered
		[() => true === false, () => done.resolve('fail')],
		[false, () => done.resolve('fail2')],

		// triggered ultimately
		[
			() => a() === 2,
			() => a.isResolved(),
			true,
			a,
			() => done.resolve(null, a() + 1)
		],
	], (err, value) => {
		t.equal(err, null);
		t.equal(value, 3);
		t.end();
	});
});

// resolve binding

// value binding

// error in predicates

// error in action

// throw in action

// empty series

// non empty series

// map

// non empty map

// test async

// test examples