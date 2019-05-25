"use strict";

const spawn = require('child_process').spawn;
const JsonDatagramSocket = require('../util/json_datagram_socket');

class NLPClassifier{

	constructor(){

		this.pythonProcess = spawn('python3',['-u', "python_classifier/classifier.py"]);

		this.concurrentRequests = [];

		this.counter = 0;

		this._stream = new JsonDatagramSocket(this.pythonProcess.stdout,   this.pythonProcess.stdin, 'utf8');

		this._stream.on('data', (msg) => {
			const id = msg.id;
			for (var i = 0; i < this.concurrentRequests.length; i++ ){
				if (id === this.concurrentRequests[i].uniqueid){

					this.concurrentRequests[i].resolve(msg);
					this.concurrentRequests.splice(i, 1);

				}
			}
		});

		this._stream.on('error', (e) => {

			console.log('error', e);
		});

		
	}

	newPromise(id){
		var process = {
			promise: null,
			resolve: null,
			reject: null,
			uniqueid: id
		};
		process.promise = new Promise((resolve, reject) => {
			process.resolve = resolve;
			process.reject = reject;
		});

		return process;
	}

	async classify(input, id){

		const promise = this.newPromise(id);
		this.concurrentRequests.push(promise);
		this._stream.write({
			id,
			input
		});
		return this.concurrentRequests[this.concurrentRequests.length - 1].promise;

	}

}

module.exports = new NLPClassifier();

