/// <reference path="../typings/tsd.d.ts" />

var mapLimit = require('map-limit');

export type Callback<T> = (err: any, value?: T) => void;

export type Action = () => void;

export type Predicate = () => boolean;

export type FlowPredicate = Gate<any> | Predicate | boolean;

export type FlowMachineDefinition<
	T1,T2,T3,T4,T5,T6,T7,T8,T9,T10,T11,T12,T13,T14,T15,T16,T17,T18,T19,T20
> = (
		t1?: Gate<T1>, t2?: Gate<T2>, t3?: Gate<T3>, t4?: Gate<T4>, t5?: Gate<T5>,
		t6?: Gate<T6>, t7?: Gate<T7>, t8?: Gate<T8>, t9?: Gate<T9>, t10?: Gate<T10>,
		t11?: Gate<T11>, t12?: Gate<T12>, t13?: Gate<T13>, t14?: Gate<T14>, t15?: Gate<T15>,
		t16?: Gate<T16>, t17?: Gate<T17>, t18?: Gate<T18>, t19?: Gate<T19>, t20?: Gate<T20>, ...moreVars: Gate<any>[]
	) => Flow[];

export type Flow =
	[Action]
	| [FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, Action ]
	| [FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, FlowPredicate, Action ]
;

export interface BaseGate<T> {
	get(): T;
	set(value?: T);
	fail(err);
	isResolved(): boolean;
	resolve(err?: any, value?: T);
	name(): string;
}

export interface Gate<T> extends BaseGate<T> {
	(): T;
}

interface ArrayGate<U> extends Gate<U[]> {
	map<Z>(mapper: (item: U, callback: Callback<Z>) => void, callback: Callback<Z[]>);
	each<Z>(mapper: (item: U, callback: Callback<Z>, previousResult: Z) => void, callback: Callback<Z[]>);
}

export interface IFlowMachineFunc { <
		Z, T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20
	>  (def: FlowMachineDefinition<
			T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20
	>, callback: Callback<Z>) : IFlowMachine;
}

export interface IFlowMachineApi extends IFlowMachineFunc {
	debug: IFlowMachineFunc;
}

export interface IFlowMachine {
	isAborted(): boolean;
	isRunning(): boolean;
	isCompleted(): boolean;
	fail(err);
	continue();
	getGate<T>(id : number | string):Gate<T>;
}

let flowMachineId = 0;

class FlowMachine implements IFlowMachine {
	id = ++flowMachineId;
	gates: Gate<any>[] = [];
	flows: FlowImpl[] = [];
	_isAborted: boolean = false;
	_isRunning: boolean = false;
	_isCompleted: boolean = false;

	constructor(private def, private callback: Callback<any>, private inDebug: boolean = false) {
		const varCount = def.length;
		const varNames = extractFunctionArgumentNames(def);
		for (let i = 0; i < varCount; i++) {
			this.gates.push(createGate(this, i, varNames[i], i === varCount - 1));
		}

		const res = def.apply(null, this.gates);
		if (varCount < 1)
			throw new Error("[flowmachine] definition should accept at least one argument");
		if (!Array.isArray(res))
			throw new Error("[flowmachine] definition should return an array of statements, got: " + res);
		this.flows = res.map((statement, i) => {
			if (!Array.isArray(statement))
				throw new Error("[flowmachine] statement should be an array, got: " + statement)
			return new FlowImpl(this, i, statement);
		});
		if (!this.flows.some(s => s.predicates.length === 0))
			throw new Error("[flowmachine] there should be at least one statement without predicates");
		if (!callback)
			throw new Error("[flowmachine] Expected callback as second argument");
	}

	run() {
		this.debug("START");
		this._isRunning = true;
		let someStatDidRun = true;
		while (someStatDidRun) {
			someStatDidRun = false;
			for (let i = 0; i < this.flows.length; i++) {
				const stat = this.flows[i]
				if (!this.isAborted() && !this.isCompleted() && !stat.didRun && stat.satisfied()) {
					someStatDidRun = true;
					stat.run();
				}
			}
		}
		this._isRunning = false;
		return this;
	}

	fail(err) {
		this.debug("FAIL", err);
		if (!this.isAborted() && !this.isCompleted()) {
			this._isAborted = true;
			this.callback(err);
		} else {
			console.error(`[flowmachine] Ignoring error, machine is already aborted or completed. Error: `, err);
		}
	}

	continue() {
		// the machine has a trampoline function for synchronous resolving values
		// so that resolving a lot of values will not run out of stack
		if (!this.isRunning())
			this.run(); // or in next tick?
	}

	complete(value) {
		this.debug("COMPLETE " + value);
		if (this.isAborted())
			return void console.error(`[flowmachine] Ignoring completion, machine was already aborted!`);
		if (this.isCompleted())
			return void console.error(`[flowmachine] Ignoring completion, machine was already completed!`);

		this._isCompleted = true;
		this.callback(null, value);
	}

	getGate<T>(id : number | string):Gate<T> {
		if (typeof id === "number" && id < this.gates.length)
			return this.gates[id];
		else if (typeof id === "string") {
			for(var i = 0; i < this.gates.length; i++)
				if (this.gates[i].name() === id)
					return this.gates[i];
		}
		throw new Error(`[flowmachine] Unable to find gate with name '${id}'`);
	}

	debug(msg: string, err?) {
		if (!this.inDebug)
			return;
		if (err)
			console.error(`[flowmachine #${this.id}] ${msg}`, err);
		else
			console.log(`[flowmachine #${this.id}] ${msg}`);
	}

	isRunning() {
		return this._isRunning;
	}

	isCompleted() {
		return this._isCompleted;
	}

	isAborted() {
		return this._isAborted;
	}
}

function createGate(machine: FlowMachine, idx: number, name:string, isResolver: boolean): Gate<any> {
	const gate = new GateImpl(machine, idx, name, isResolver);
	const f:any = function() {
		if (arguments.length > 0)
			throw new Error(`[flowmachine] Gate '${gate.name()}()' should be invoked without arguments.`);
		return gate.get();
	};
	f.isFlowVar = true;
	for (var key in GateImpl.prototype)
		if (typeof GateImpl.prototype[key] === 'function')
			f[key] = GateImpl.prototype[key].bind(gate);
	return <Gate<any>>f;
}

function isGate(thing): boolean {
	return typeof thing === 'function' && thing.isFlowVar === true;
}

class GateImpl<T> implements BaseGate<T> {
	resolved: boolean = false;
	value: T;

	constructor(public machine: FlowMachine, public idx: number, public _name: string, public isResolver: boolean) {
		// Note: name is for debugging purposes only and can be changed by code obfuscation!
	}

	name() {
		return this._name;
	}

	assertResolved() {
		if (!this.resolved)
			this.machine.fail(new Error(`[flowmachine] illegal state: gate '${this.name}' has not yet been resolved`));
	}

	isResolved(): boolean {
		return this.resolved;
	}

	get(): T {
		this.assertResolved();
		return this.value;
	}

	set(value: T = null) {
		this.machine.debug(`SET GATE #${this.idx} (${this.name()}): ${value}`);
		if (arguments.length > 1)
			this.machine.fail(new Error(`[flowmachine] illegal state: tried to assign multiple values to gate '${this.name}'. For node callback style resolving use 'gate.resolve'.`));
		if (this.resolved)
			this.machine.fail(new Error(`[flowmachine] illegal state: gate '${this.name}' has already been resolved`));
		this.resolved = true;
		this.value = value;
		if (this.isResolver)
			this.machine.complete(value);
		else
			this.machine.continue();
	}

	fail(err) {
		this.machine.debug(`FAIL GATE #${this.idx} (${this.name()}): `, err);
		if (this.resolved)
			this.machine.fail(new Error(`[flowmachine] illegal state: gate '${this.name}' has already been resolved`));
		this.resolved = true;
		this.machine.fail(err);
	}

	resolve(err?, value: T = null) {
		if (arguments.length > 2)
			this.machine.fail(new Error(`[flowmachine] illegal state: tried to resolve multiple values to gate '${this.name}'. Please assign only one value.`));
		err ? this.fail(err) : this.set(value);
	}
}

class FlowImpl {
	predicates: FlowPredicate[];
	action: Action;
	didRun = false;

	constructor(private machine: FlowMachine, private idx: number, def: Flow) {
		if (!Array.isArray(def) || def.length === 0)
			throw new Error(`[flowmachine] Flow should be an array with at least one value (at index ${idx})`);
		this.predicates = <any> def.slice(0, def.length - 1);
		this.action = <Action> def[def.length - 1];
		this.predicates.forEach((item, i) => {
			if (!isGate(item) && !isLambda(item) && typeof item !== "boolean")
				throw new Error(`[flowmachine] Flow ${idx} predicate ${i} should be either a gate, a function without arguments or a boolean`);
		});
		if (!isLambda(this.action))
			throw new Error(`[flowmachine] Flow definition at index ${idx} should end with a function without arguments`);
	}

	satisfied(): boolean {
		return this.predicates.every((pred: any, i) => {
			if (this.machine.isAborted())
				return false;
			try {
				if (typeof pred === "boolean")
					return pred;
				if (isGate(pred))
					return pred.isResolved();
				return pred();
			} catch (e) {
				const msg = `[flowmachine] Predicate at index ${i} of flow ${this.idx} (${pred}) threw exception: ` + e;
				console.error(msg, e);
				this.machine.fail(new Error(msg));
			}
		})
	}

	run() {
		this.machine.debug("START FLOW #" + this.idx);
		this.didRun = true;
		try {
			this.action();
		} catch (e) {
			const msg = `[flowmachine] Flow at index ${this.idx} (${this.action}) threw exception: ` + e;
			console.error(msg, e);
			this.machine.fail(new Error(msg));
		}
	}
}

function isLambda(item): boolean {
	return typeof item === "function" && item.length === 0;
}

function extractFunctionArgumentNames(fn: Function): string[] {
	//http://stackoverflow.com/a/14660057
	return fn.toString()
	.replace(/((\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s))/mg,'')
	.match(/^function\s*[^\(]*\(\s*([^\)]*)\)/m)[1]
	.split(/,/);
}

/**
 * Exposed api
 */

const flowMachine:IFlowMachineApi = <any> function(def, callback) {
	return new FlowMachine(def, callback).run();
};

flowMachine.debug = function(def, callback) {
	return new FlowMachine(def, callback, true).run();
}

export default flowMachine;
export var gatePrototype = <any> GateImpl.prototype;